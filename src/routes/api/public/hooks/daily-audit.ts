// Daily audit endpoint — cron-triggered. Computes hit-rate for the last window
// of predictions, snapshots current market regime + drift, runs the auto-tuner
// to update min_confidence, and writes to prediction_audit + model_health +
// auto_tune_state / auto_tune_history. Public endpoint (no PII returned).

import { createFileRoute } from "@tanstack/react-router";
import { fetchPredictionReview } from "@/lib/prediction-review";
import { detectRegime } from "@/lib/ml/regime";
import { detectDrift } from "@/lib/ml/drift";
import { computeCalibration } from "@/lib/ml/calibration";
import { decideTune } from "@/lib/ml/auto-tuner";

export const Route = createFileRoute("/api/public/hooks/daily-audit")({
  server: {
    handlers: {
      POST: async () => {
        const started = Date.now();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const review = await fetchPredictionReview();
          const outcomes = review.outcomes;
          const window20 = outcomes.filter((o) => o.status !== "pending");
          const hits = window20.filter((o) => o.status === "hit").length;
          const misses = window20.filter((o) => o.status === "miss").length;
          const pending = outcomes.filter((o) => o.status === "pending").length;
          const settled = hits + misses;
          const hitRate = settled ? hits / settled : null;
          const avgRet = settled
            ? window20.reduce((a, b) => a + (b.finalRet ?? 0), 0) / settled
            : null;
          const avgMax = settled
            ? window20.reduce((a, b) => a + (b.maxRet ?? 0), 0) / settled
            : null;

          const [regime, drift] = await Promise.all([detectRegime(20), detectDrift(20, 90)]);

          const calibPoints = window20
            .filter((o) => o.probability != null)
            .map((o) => ({
              predicted: (o.probability as number) / 100,
              hit: (o.status === "hit" ? 1 : 0) as 0 | 1,
            }));
          const calibration = computeCalibration(calibPoints, 10);

          const alerts: string[] = [];
          if (hitRate != null && hitRate < 0.4) alerts.push("Son 20g isabet oranı %40 altında");
          if (drift.level !== "stable") alerts.push(`Feature drift: ${drift.level.toUpperCase()} (PSI ${drift.psi})`);
          if (regime.regime === "risk_off") alerts.push("Piyasa risk-off; konservatif filtre önerilir");
          if (calibration.ece > 0.15) alerts.push(`Kalibrasyon hatası yüksek (ECE ${calibration.ece})`);

          const today = new Date().toISOString().slice(0, 10);
          await supabaseAdmin.from("prediction_audit").upsert(
            {
              audit_date: today,
              window_days: 20,
              total_predictions: outcomes.length,
              hits,
              misses,
              pending,
              hit_rate: hitRate,
              avg_return: avgRet,
              avg_max_return: avgMax,
              regime: regime.regime,
              notes: { alerts, calibration_ece: calibration.ece, brier: calibration.brier },
            },
            { onConflict: "audit_date,window_days" },
          );

          await supabaseAdmin.from("model_health").insert({
            regime: regime.regime,
            regime_score: regime.regimeScore,
            bist_trend: regime.trend,
            bist_volatility: regime.volatility,
            drift_psi: drift.psi,
            drift_level: drift.level,
            calibration_error: calibration.ece,
            calibration_bins: calibration.bins as unknown as any,
            alerts,
            meta: {
              regime_detail: regime,
              drift_features: drift.features,
              calibration: { brier: calibration.brier, sample: calibration.sample, platt: calibration.platt },
            } as unknown as any,
          });

          // ===== Auto-tuner: adjust min_confidence based on hit rate =====
          const stateRes = await supabaseAdmin
            .from("auto_tune_state")
            .select("*")
            .eq("id", 1)
            .maybeSingle();
          const currentMinConf = stateRes.data?.min_confidence != null ? Number(stateRes.data.min_confidence) : 60;
          const decision = decideTune({
            hitRate,
            sampleSize: settled,
            currentMinConfidence: currentMinConf,
          });
          if (decision.action !== "insufficient_data") {
            await supabaseAdmin.from("auto_tune_state").upsert({
              id: 1,
              min_confidence: decision.newMinConfidence,
              last_hit_rate: hitRate,
              last_tuned_at: new Date().toISOString(),
              notes: { action: decision.action, reason: decision.reason } as unknown as any,
            });
            await supabaseAdmin.from("auto_tune_history").insert({
              prev_min_confidence: currentMinConf,
              new_min_confidence: decision.newMinConfidence,
              hit_rate: hitRate,
              sample_size: settled,
              action: decision.action,
              reason: decision.reason,
              disabled_patterns: decision.disablePatterns,
            });
          }

          return Response.json({
            ok: true,
            audit: { hits, misses, pending, hit_rate: hitRate },
            regime: regime.regime,
            drift: drift.level,
            auto_tune: {
              action: decision.action,
              from: currentMinConf,
              to: decision.newMinConfidence,
              reason: decision.reason,
            },
            alerts,
            duration_ms: Date.now() - started,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
