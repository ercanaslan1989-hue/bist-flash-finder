// ============================================================================
// Ensemble — deterministically blends the live Rule Engine (Champion) with one
// or more ML Challenger models into a single decision score (FAZ 5).
//
// This module is PURE maths: it never trains, never touches the database and
// never mutates the live system. It only combines already-computed per-sample
// probabilities. Every member score is expected in [0,1]; the Champion's 0-100
// Rule-Engine score is normalised into that range by the serving layer.
//
// Blending is look-ahead-free and reproducible: the same inputs always produce
// the same blended scores. A logistic "stacker" can be fit on a training split
// to learn optimal member weights — but that fitting only ever sees training
// rows, and the fitted weights are then applied unchanged to unseen test rows.
//
// Controlled by design: the Champion is always a first-class member with its
// own weight, so no configuration can silently discard the live signal.
// ============================================================================

/** Supported blending strategies. New strategies slot in without touching callers. */
export type EnsembleMethod = "weighted" | "rank" | "logistic" | "max" | "gated";

/** One participant in the ensemble with its per-sample probabilities. */
export interface EnsembleMember {
  id: string;
  label: string;
  role: "champion" | "challenger";
  /** Relative weight (>= 0). Normalised internally where the method uses it. */
  weight: number;
  /** Per-sample probability of the positive ("up") class, in [0,1]. */
  scores: number[];
}

export interface EnsembleConfig {
  method: EnsembleMethod;
  /**
   * For "gated": a challenger only participates on a given sample when its
   * confidence |p-0.5|*2 reaches this threshold (0-1). Otherwise the Champion
   * decides alone. Default 0.6.
   */
  gateConfidence?: number;
  /**
   * For "logistic": [bias, w_member0, w_member1, …] aligned to `members` order.
   * Typically produced by `fitLogisticStacker`. When absent, logistic falls
   * back to an unweighted average.
   */
  logisticWeights?: number[];
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/**
 * Percentile-rank a vector into [0,1] with average ranks for ties. Deterministic
 * and order-preserving in output. Used by the "rank" method to fairly combine
 * members whose raw scores are on different scales / calibrations.
 */
export function rankNormalize(xs: number[]): number[] {
  const n = xs.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const avg = (i + j) / 2; // 0-based average rank
    for (let k = i; k <= j; k++) ranks[idx[k]] = avg / (n - 1);
    i = j + 1;
  }
  return ranks;
}

/** Weighted average of members, weights normalised over positive weights. */
function weightedBlend(members: EnsembleMember[], n: number): number[] {
  const wsum = members.reduce((a, m) => a + Math.max(0, m.weight), 0) || 1;
  const out = new Array<number>(n).fill(0);
  for (const m of members) {
    const w = Math.max(0, m.weight) / wsum;
    for (let i = 0; i < n; i++) out[i] += w * clamp01(m.scores[i] ?? 0.5);
  }
  return out.map(clamp01);
}

function rankBlend(members: EnsembleMember[], n: number): number[] {
  const wsum = members.reduce((a, m) => a + Math.max(0, m.weight), 0) || 1;
  const ranked = members.map((m) => rankNormalize(m.scores.map((s) => clamp01(s ?? 0.5))));
  const out = new Array<number>(n).fill(0);
  members.forEach((m, mi) => {
    const w = Math.max(0, m.weight) / wsum;
    for (let i = 0; i < n; i++) out[i] += w * ranked[mi][i];
  });
  return out.map(clamp01);
}

function maxBlend(members: EnsembleMember[], n: number): number[] {
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let mx = 0;
    for (const m of members) mx = Math.max(mx, clamp01(m.scores[i] ?? 0.5));
    out[i] = mx;
  }
  return out;
}

function logisticBlend(members: EnsembleMember[], n: number, weights?: number[]): number[] {
  if (!weights || weights.length !== members.length + 1) {
    // No fitted stacker → plain average of members.
    return weightedBlend(
      members.map((m) => ({ ...m, weight: 1 })),
      n,
    );
  }
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let z = weights[0];
    for (let m = 0; m < members.length; m++) z += weights[m + 1] * clamp01(members[m].scores[i] ?? 0.5);
    out[i] = sigmoid(z);
  }
  return out;
}

/**
 * Champion decides by default; a challenger overrides only when confident.
 * When one or more challengers clear the gate on a sample, the blended value is
 * the weighted average of the Champion plus those confident challengers.
 */
function gatedBlend(members: EnsembleMember[], n: number, gate: number): number[] {
  const champion = members.find((m) => m.role === "champion");
  const challengers = members.filter((m) => m.role === "challenger");
  const out = new Array<number>(n).fill(0.5);
  for (let i = 0; i < n; i++) {
    const champScore = champion ? clamp01(champion.scores[i] ?? 0.5) : 0.5;
    const confident = challengers.filter((m) => Math.abs(clamp01(m.scores[i] ?? 0.5) - 0.5) * 2 >= gate);
    if (confident.length === 0) {
      out[i] = champScore;
      continue;
    }
    const parts = champion ? [champion, ...confident] : confident;
    const wsum = parts.reduce((a, m) => a + Math.max(0, m.weight), 0) || 1;
    let v = 0;
    for (const m of parts) v += (Math.max(0, m.weight) / wsum) * clamp01(m.scores[i] ?? 0.5);
    out[i] = clamp01(v);
  }
  return out;
}

/** Blend member probabilities into one score per sample, in [0,1]. */
export function blendScores(members: EnsembleMember[], config: EnsembleConfig): number[] {
  const n = members.reduce((mx, m) => Math.max(mx, m.scores.length), 0);
  if (n === 0 || members.length === 0) return [];
  switch (config.method) {
    case "rank":
      return rankBlend(members, n);
    case "max":
      return maxBlend(members, n);
    case "logistic":
      return logisticBlend(members, n, config.logisticWeights);
    case "gated":
      return gatedBlend(members, n, config.gateConfidence ?? 0.6);
    case "weighted":
    default:
      return weightedBlend(members, n);
  }
}

export interface StackerOptions {
  iterations?: number;
  learningRate?: number;
  /** L2 regularisation strength on member weights (not the bias). */
  l2?: number;
}

/**
 * Fit a logistic-regression meta-model (stacking) over member scores.
 *
 * Deterministic full-batch gradient descent from zero-initialised weights, so
 * the same rows + labels always yield the same weights. Returns
 * [bias, w_member0, …] aligned to the column order of `rows`.
 *
 * IMPORTANT: only ever pass TRAINING rows here. The returned weights are then
 * applied to unseen rows via the "logistic" method — this keeps the ensemble
 * strictly look-ahead-free.
 */
export function fitLogisticStacker(
  rows: number[][],
  labels: number[],
  opts: StackerOptions = {},
): number[] {
  const iterations = opts.iterations ?? 400;
  const lr = opts.learningRate ?? 0.5;
  const l2 = opts.l2 ?? 1e-3;
  const n = rows.length;
  const k = n ? rows[0].length : 0;
  const w = new Array<number>(k + 1).fill(0);
  if (n === 0 || k === 0) return w;
  for (let it = 0; it < iterations; it++) {
    const grad = new Array<number>(k + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let z = w[0];
      for (let j = 0; j < k; j++) z += w[j + 1] * rows[i][j];
      const err = sigmoid(z) - labels[i];
      grad[0] += err;
      for (let j = 0; j < k; j++) grad[j + 1] += err * rows[i][j];
    }
    w[0] -= (lr * grad[0]) / n;
    for (let j = 1; j <= k; j++) w[j] -= lr * (grad[j] / n + l2 * w[j]);
  }
  return w;
}

export interface BlendMetrics {
  /** Positive calls that have a realised return (tradeable signals). */
  signals: number;
  /** Fraction of settled positive calls whose label was 1. */
  precision: number | null;
  /** Mean realised forward return across the signals (%). */
  avgReturn: number | null;
  /** Percentage of signals with a positive return. */
  hitRate: number | null;
}

/**
 * Classification + financial quality of a blended score vector at a threshold.
 * Rows with a null label are ignored for precision; rows with a null return are
 * ignored for return/hit-rate — mirroring the Evaluator's settled-only rule.
 */
export function evaluateBlend(
  scores: number[],
  labels: (0 | 1 | null)[],
  returns: (number | null)[],
  threshold: number,
): BlendMetrics {
  let truePos = 0;
  let settledPicks = 0;
  const rets: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < threshold) continue;
    if (labels[i] != null) {
      settledPicks++;
      if (labels[i] === 1) truePos++;
    }
    if (returns[i] != null) rets.push(returns[i] as number);
  }
  const wins = rets.filter((r) => r > 0).length;
  return {
    signals: rets.length,
    precision: settledPicks ? truePos / settledPicks : null,
    avgReturn: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
    hitRate: rets.length ? (wins / rets.length) * 100 : null,
  };
}
