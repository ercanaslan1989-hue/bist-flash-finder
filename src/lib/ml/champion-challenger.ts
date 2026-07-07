// ============================================================================
// Champion–Challenger — compares the live Rule Engine (Champion) against ML
// Challenger models on the SAME test rows, over the SAME horizon.
//
// The Champion never changes here. This module only measures and reports. A
// Challenger is flagged `isCandidate` when it beats the Champion on BOTH the
// primary decision metric (precision of positive calls) AND realised average
// return — but promotion is always a manual decision made elsewhere. No
// auto-switching, ever.
// ============================================================================

import { evaluateModel } from "./evaluator";
import { predictBatch } from "./predictor";
import type { EvalReport, MlHorizon, Sample, TrainedModel } from "./types";

export interface SideMetrics {
  id: string;
  label: string;
  signals: number;
  precision: number | null;
  avgReturn: number | null;
  hitRate: number | null;
}

export interface Comparison {
  horizon: MlHorizon;
  threshold: number;
  champion: SideMetrics;
  challenger: SideMetrics;
  winner: "champion" | "challenger" | "tie";
  /** True only when the challenger clearly beats the champion. */
  isCandidate: boolean;
  challengerReport: EvalReport;
}

/**
 * Champion metrics: treat the Rule-Engine score >= `championThreshold` (0-100)
 * as a positive call, and measure precision + realised return on the same test
 * rows the challenger sees.
 */
function championMetrics(
  test: Sample[],
  horizon: MlHorizon,
  championThreshold: number,
): SideMetrics {
  const settled = test.filter(
    (s) => s.labels[horizon].up != null && s.championScore != null,
  );
  const picks = settled.filter((s) => (s.championScore ?? 0) >= championThreshold);
  const rets = picks
    .map((s) => s.labels[horizon].forwardReturn)
    .filter((r): r is number => r != null);
  const wins = rets.filter((r) => r > 0);
  const truePos = picks.filter((s) => s.labels[horizon].up === 1).length;
  return {
    id: "rule_engine",
    label: "Kural Motoru (Şampiyon)",
    signals: picks.length,
    precision: picks.length ? truePos / picks.length : null,
    avgReturn: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
    hitRate: rets.length ? (wins.length / rets.length) * 100 : null,
  };
}

/**
 * Compare one challenger model against the champion on a test split.
 * @param championThreshold Rule-Engine score cutoff (0-100) for a positive call.
 * @param challengerThreshold Model probability cutoff (0-1) for a positive call.
 */
export function compareToChampion(
  model: TrainedModel,
  test: Sample[],
  horizon: MlHorizon,
  championThreshold = 60,
  challengerThreshold = 0.5,
): Comparison {
  const report = evaluateModel(model, test, horizon, challengerThreshold);
  const champion = championMetrics(test, horizon, championThreshold);

  const settled = test.filter((s) => s.labels[horizon].up != null);
  const scores = predictBatch(model, settled);
  const picks = settled.filter((_, i) => scores[i] >= challengerThreshold);
  const rets = picks
    .map((s) => s.labels[horizon].forwardReturn)
    .filter((r): r is number => r != null);
  const wins = rets.filter((r) => r > 0);

  const challenger: SideMetrics = {
    id: model.version,
    label: model.label,
    signals: picks.length,
    precision: report.classification.precision,
    avgReturn: report.financial.avgReturn,
    hitRate: rets.length ? (wins.length / rets.length) * 100 : null,
  };

  const precBeats = (challenger.precision ?? 0) > (champion.precision ?? 0);
  const retBeats = (challenger.avgReturn ?? -Infinity) > (champion.avgReturn ?? -Infinity);
  const enoughSignals = challenger.signals >= 20;

  let winner: Comparison["winner"] = "tie";
  if (precBeats && retBeats) winner = "challenger";
  else if (!precBeats && !retBeats) winner = "champion";

  return {
    horizon,
    threshold: challengerThreshold,
    champion,
    challenger,
    winner,
    isCandidate: precBeats && retBeats && enoughSignals,
    challengerReport: report,
  };
}
