// Weekly re-calibration endpoint — cron-triggered. Recomputes calibration and
// regime baselines and appends a retrain_history record. Note: full model
// retraining requires the ML Lab (uses buildDataset which fetches hundreds of
// OHLC series and doesn't fit inside a Worker request); this endpoint refreshes
// the lightweight adaptive layer (calibration + regime) so live predictions
// remain aligned with the current market state.

import { createFileRoute } from "@tanstack/react-router";
import { fetchPredictionOutcomes } from "@/lib/prediction-review";
import { detectRegime } from "@/lib/ml/regime";
import { detectDrift } from "@/lib/ml/drift";
import { computeCalibration } from "@/lib/ml/calibration";

export const Route = createFileRoute("/api/public/hooks/weekly-retrain")({
  server: {
    handlers: {
      POST: async () => {
        const started = Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rec } = await supabaseAdmin
          .from("retrain_history")
          .insert({ trigger: "cron_weekly", status: "running" })
          .select("id")
          .single();
        const id = rec?.id as string | undefined;

        try {
          const [regime, drift, outcomes] = await Promise.all([
            detectRegime(20),
            detectDrift(20, 90),
            fetchPredictionOutcomes(120),
          ]);
          const settled = outcomes.filter((o) => o.status !== "pending" && o.probability != null);
          const calibration = computeCalibration(
            settled.map((o) => ({
              predicted: (o.probability as number) / 100,
              hit: (o.status === "hit" ? 1 : 0) as 0 | 1,
            })),
            10,
          );

          const summary = {
            regime,
            drift: { level: drift.level, psi: drift.psi, features: drift.features },
            calibration: {
              ece: calibration.ece,
              brier: calibration.brier,
              sample: calibration.sample,
              platt: calibration.platt,
            },
            settled_sample: settled.length,
          };

          if (id) {
            await supabaseAdmin
              .from("retrain_history")
              .update({
                finished_at: new Date().toISOString(),
                status: "ok",
                regime: regime.regime,
                duration_ms: Date.now() - started,
                summary,
              })
              .eq("id", id);
          }
          return Response.json({ ok: true, summary, duration_ms: Date.now() - started });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (id) {
            await supabaseAdmin
              .from("retrain_history")
              .update({
                finished_at: new Date().toISOString(),
                status: "error",
                duration_ms: Date.now() - started,
                error: message,
              })
              .eq("id", id);
          }
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
