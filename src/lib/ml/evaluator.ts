// ============================================================================
// Evaluator — classification + financial metrics for a model on a dataset.
//
// Classification: precision, recall, F1, accuracy, ROC-AUC, PR-AUC, confusion
// matrix, plus ROC and PR curves. AUCs are computed directly from ranked scores
// (no sklearn), deterministic and tie-aware.
//
// Financial: treats each positive call as one equal-weight trade using the
// realised forward return at the horizon, then reuses the same avg/PF/Sharpe/
// max-drawdown maths as the backtest engine.
// ============================================================================

import { featureLabel } from "./feature-vector";
import { predictBatch } from "./predictor";
import type {
  ClassificationMetrics,
  CurvePoint,
  EvalReport,
  FinancialMetrics,
  MlHorizon,
  Sample,
  TrainedModel,
} from "./types";

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mu = mean(xs)!;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1));
}
function maxDrawdown(returnsInOrder: number[]): number | null {
  if (!returnsInOrder.length) return null;
  let cum = 0;
  let peak = 0;
  let dd = 0;
  for (const r of returnsInOrder) {
    cum += r;
    if (cum > peak) peak = cum;
    if (cum - peak < dd) dd = cum - peak;
  }
  return dd;
}

/**
 * Trapezoidal ROC-AUC from scores + binary labels. Equivalent to the
 * Mann–Whitney U statistic; handles ties via midpoint ranks.
 */
export function rocAuc(scores: number[], labels: number[]): number {
  const n = scores.length;
  let pos = 0;
  for (const l of labels) pos += l;
  const neg = n - pos;
  if (pos === 0 || neg === 0) return 0.5;

  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a] - scores[b]);
  // Assign average ranks (1-based) to handle ties.
  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avgRank;
    i = j + 1;
  }
  let sumRankPos = 0;
  for (let k = 0; k < n; k++) if (labels[k] === 1) sumRankPos += ranks[k];
  return (sumRankPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** PR curve + PR-AUC (trapezoidal over recall). Also returns ROC curve. */
function curves(scores: number[], labels: number[]): {
  roc: CurvePoint[];
  pr: CurvePoint[];
  prAuc: number;
} {
  const n = scores.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  let pos = 0;
  for (const l of labels) pos += l;
  const neg = n - pos;

  const roc: CurvePoint[] = [{ x: 0, y: 0 }];
  const pr: CurvePoint[] = [];
  let tp = 0;
  let fp = 0;
  let prAuc = 0;
  let prevRecall = 0;
  let prevPrec = 1;
  let firstPr = true;

  for (let k = 0; k < n; k++) {
    if (labels[order[k]] === 1) tp++;
    else fp++;
    // Only emit a point when the score changes (proper step curve).
    if (k + 1 < n && scores[order[k + 1]] === scores[order[k]]) continue;
    const recall = pos ? tp / pos : 0;
    const precision = tp + fp ? tp / (tp + fp) : 1;
    const fpr = neg ? fp / neg : 0;
    roc.push({ x: fpr, y: recall });
    if (firstPr) {
      pr.push({ x: 0, y: precision });
      firstPr = false;
    }
    pr.push({ x: recall, y: precision });
    prAuc += ((precision + prevPrec) / 2) * (recall - prevRecall);
    prevRecall = recall;
    prevPrec = precision;
  }

  return { roc, pr, prAuc: Math.max(0, Math.min(1, prAuc)) };
}

function classification(
  scores: number[],
  labels: number[],
  threshold: number,
): ClassificationMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < scores.length; i++) {
    const pred = scores[i] >= threshold ? 1 : 0;
    if (pred === 1 && labels[i] === 1) tp++;
    else if (pred === 1 && labels[i] === 0) fp++;
    else if (pred === 0 && labels[i] === 0) tn++;
    else fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = scores.length ? (tp + tn) / scores.length : 0;
  const pos = labels.reduce((a, b) => a + b, 0);
  const { prAuc } = curves(scores, labels);
  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    f1,
    accuracy,
    rocAuc: rocAuc(scores, labels),
    prAuc,
    baseRate: scores.length ? pos / scores.length : 0,
  };
}

function financial(samples: Sample[], scores: number[], threshold: number, horizon: MlHorizon): FinancialMetrics {
  const picks = samples
    .map((s, i) => ({ s, p: scores[i] }))
    .filter((x) => x.p >= threshold)
    .map((x) => ({ date: x.s.date, ret: x.s.labels[horizon].forwardReturn }))
    .filter((x) => x.ret != null) as { date: string; ret: number }[];
  picks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rets = picks.map((p) => p.ret);
  const wins = rets.filter((r) => r > 0);
  const losses = rets.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const sd = stddev(rets);
  const mu = mean(rets);
  return {
    signals: rets.length,
    avgReturn: mu,
    medianReturn: median(rets),
    hitRate: rets.length ? (wins.length / rets.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    sharpe: sd && sd > 0 && mu != null ? (mu / sd) * Math.sqrt(252 / horizon) : null,
    maxDrawdown: maxDrawdown(rets),
  };
}

/** Downsample a curve to at most `max` points for lightweight charts. */
function thin(points: CurvePoint[], max = 60): CurvePoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: CurvePoint[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/** Full evaluation of a model over a settled test/validation set. */
export function evaluateModel(
  model: TrainedModel,
  samples: Sample[],
  horizon: MlHorizon,
  threshold = 0.5,
): EvalReport {
  const settled = samples.filter((s) => s.labels[horizon].up != null);
  const scores = predictBatch(model, settled);
  const labels = settled.map((s) => (s.labels[horizon].up === 1 ? 1 : 0));

  const cls = classification(scores, labels, threshold);
  const fin = financial(settled, scores, threshold, horizon);
  const { roc, pr } = curves(scores, labels);

  // Feature importance = normalised total split gain per feature.
  const gains = importanceFromModel(model);
  const total = gains.reduce((a, b) => a + b.importance, 0) || 1;
  const featureImportance = gains
    .map((g) => ({ feature: g.feature, importance: g.importance / total }))
    .sort((a, b) => b.importance - a.importance);

  return {
    horizon,
    n: settled.length,
    classification: cls,
    financial: fin,
    rocCurve: thin(roc),
    prCurve: thin(pr),
    featureImportance,
  };
}

/** Per-feature importance from the model's stored total split gains. */
export function importanceFromModel(model: TrainedModel): { feature: string; importance: number }[] {
  return model.featureNames.map((f, i) => ({
    feature: featureLabel(f),
    importance: model.gainByFeature[i] ?? 0,
  }));
}
