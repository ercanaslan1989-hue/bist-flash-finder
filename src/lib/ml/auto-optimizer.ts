// ============================================================================
// AutoOptimizer — exhaustive, look-ahead-free ensemble parameter sweep.
//
// Sweeps four axes together and, for each combination, computes the full
// classification + financial + risk profile of the blended decision on a
// held-out chronological test split:
//
//   • Etiket eşiği (upThreshold)       — regenerates the dataset labels
//   • Karar eşiği  (decisionThreshold) — applied to the blended score
//   • Gated güven eşiği (gateConfidence) — only meaningful for "gated"
//   • Şampiyon ağırlığı (championWeight) — Champion weight in the blend
//
// Efficiency: for each `upThreshold` we build the dataset ONCE, train the
// Challenger models ONCE, and precompute Champion + Challenger member scores
// on the test split ONCE. Combinations across method / decision threshold /
// gate / champion weight then reduce to a few array operations per combo.
//
// Strictly look-ahead-free: models are trained on chronological TRAIN rows
// only; every combo is measured on unseen TEST rows. The logistic stacker
// weights are fitted on TRAIN only and applied unchanged to TEST. No live
// system state is mutated.
// ============================================================================

import { buildDataset, type DatasetParams } from "./dataset-builder";
import { blendScores, type EnsembleMember, type EnsembleMethod } from "./ensemble";
import { selectFeatures } from "./feature-selector";
import { normalizeChampionScore } from "./model-server";
import { fitServingStacker } from "./model-server";
import { DEFAULT_MODEL_TYPES, defaultConfig } from "./models";
import { predictBatch } from "./predictor";
import { timeSeriesSplit, trainModel } from "./trainer";
import { MlAbortError, type MlHorizon, type MlProgress, type Sample, type TrainedModel } from "./types";

// -------- Parameter grid (matches the product spec exactly) --------

export const AUTO_LABEL_THRESHOLDS = [2, 3, 4, 5, 6, 7, 8] as const;
export const AUTO_DECISION_THRESHOLDS = [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85] as const;
export const AUTO_GATE_CONFIDENCES = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9] as const;
export const AUTO_CHAMPION_WEIGHTS = [1, 1.5, 2, 2.5, 3] as const;
export const AUTO_METHODS: EnsembleMethod[] = ["weighted", "gated", "logistic"];

export interface AutoCombo {
  method: EnsembleMethod;
  upThreshold: number;
  decisionThreshold: number;
  gateConfidence: number;
  championWeight: number;
}

export interface AutoMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  avgReturn: number | null;
  medianReturn: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  totalTrades: number;
  winRate: number | null;
  profitFactor: number | null;
  avgHoldDays: number;
  /** avgReturn / |maxDrawdown|. null when drawdown is 0/undefined. */
  riskAdjusted: number | null;
}

export interface AutoResult {
  combo: AutoCombo;
  metrics: AutoMetrics;
}

export interface AutoBestArtifacts {
  blendedScores: number[];
  labels: (0 | 1)[];
  returns: (number | null)[];
  dates: string[];
  featureImportance: { feature: string; importance: number }[];
  logisticWeights: number[] | null;
  challengerLabels: string[];
  challengerIds: string[];
  testSamples: number;
}

export interface AutoRunOutput {
  results: AutoResult[]; // ranked by F1 desc
  byRiskAdjusted: AutoResult[];
  best: AutoResult;
  bestArtifacts: AutoBestArtifacts;
  totalCombos: number;
  elapsedMs: number;
}

export interface AutoRunOptions {
  signal?: AbortSignal;
  onPhase?: (phase: string) => void;
  onDatasetProgress?: (p: MlProgress) => void;
  /** Progress across combos [0..1]. */
  onProgress?: (info: { processed: number; total: number; percent: number }) => void;
}

// -------- Metric helpers (kept local to avoid coupling with evaluator.ts) --------

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
function maxDrawdownAbs(returnsInOrder: number[]): number {
  let cum = 0;
  let peak = 0;
  let dd = 0;
  for (const r of returnsInOrder) {
    cum += r;
    if (cum > peak) peak = cum;
    if (cum - peak < dd) dd = cum - peak;
  }
  return Math.abs(dd);
}

function computeMetrics(
  blended: number[],
  labels: (0 | 1)[],
  returnsByIdx: (number | null)[],
  datesByIdx: string[],
  decisionThreshold: number,
  horizon: MlHorizon,
): AutoMetrics {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  const picks: { d: string; r: number }[] = [];
  for (let i = 0; i < blended.length; i++) {
    const pred = blended[i] >= decisionThreshold ? 1 : 0;
    const y = labels[i];
    if (pred === 1 && y === 1) tp++;
    else if (pred === 1 && y === 0) fp++;
    else if (pred === 0 && y === 0) tn++;
    else fn++;
    if (pred === 1) {
      const r = returnsByIdx[i];
      if (r != null) picks.push({ d: datesByIdx[i], r });
    }
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = blended.length ? (tp + tn) / blended.length : 0;

  picks.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const rets = picks.map((p) => p.r);
  const wins = rets.filter((r) => r > 0);
  const losses = rets.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const sd = stddev(rets);
  const mu = mean(rets);
  const mdd = rets.length ? maxDrawdownAbs(rets) : 0;

  return {
    accuracy,
    precision,
    recall,
    f1,
    avgReturn: mu,
    medianReturn: median(rets),
    sharpe: sd && sd > 0 && mu != null ? (mu / sd) * Math.sqrt(252 / horizon) : null,
    maxDrawdown: rets.length ? -mdd : null,
    totalTrades: rets.length,
    winRate: rets.length ? (wins.length / rets.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgHoldDays: horizon,
    riskAdjusted: mu != null && mdd > 0 ? mu / mdd : null,
  };
}

// -------- Blending using precomputed per-sample member scores --------

function blendWithMembers(
  method: EnsembleMethod,
  championWeight: number,
  gateConfidence: number,
  champScores: number[],
  challengerScores: number[][],
  challengerLabels: string[],
  logisticWeights: number[] | null,
): number[] {
  const members: EnsembleMember[] = [
    { id: "rule_engine", label: "Şampiyon", role: "champion", weight: championWeight, scores: champScores },
    ...challengerScores.map((sc, i) => ({
      id: `ch_${i}`,
      label: challengerLabels[i],
      role: "challenger" as const,
      weight: 1,
      scores: sc,
    })),
  ];
  return blendScores(members, {
    method,
    gateConfidence,
    logisticWeights: method === "logistic" ? logisticWeights ?? undefined : undefined,
  });
}

// -------- Per-upThreshold bundle --------

interface UtBundle {
  upThreshold: number;
  challengers: { id: string; label: string; model: TrainedModel }[];
  champScoresTest: number[];
  challengerScoresTest: number[][];
  labels: (0 | 1)[];
  returns: (number | null)[];
  dates: string[];
  logisticWeights: number[];
}

async function trainForUpThreshold(
  base: DatasetParams,
  horizon: MlHorizon,
  upThreshold: number,
  options: AutoRunOptions,
): Promise<UtBundle> {
  const signal = options.signal;
  options.onPhase?.(`Etiket %${upThreshold}: veri seti hazırlanıyor…`);
  const samples: Sample[] = await buildDataset(
    { ...base, upThreshold },
    { signal, onProgress: options.onDatasetProgress },
  );
  if (signal?.aborted) throw new MlAbortError();
  if (samples.length < 200) throw new Error(`Etiket %${upThreshold}: yeterli örnek yok (${samples.length}).`);

  const split = timeSeriesSplit(samples, 0.6, 0.2);
  const selected = selectFeatures(split.train);

  const challengers: { id: string; label: string; model: TrainedModel }[] = [];
  for (const type of DEFAULT_MODEL_TYPES) {
    if (signal?.aborted) throw new MlAbortError();
    options.onPhase?.(`Etiket %${upThreshold}: ${type.toUpperCase()} Challenger eğitiliyor…`);
    await new Promise((r) => setTimeout(r, 0));
    const model = trainModel(split.train, {
      config: defaultConfig(type),
      horizon,
      upThreshold,
      featureNames: selected,
    });
    challengers.push({ id: type, label: model.label, model });
  }

  // Fit logistic stacker on TRAIN only (look-ahead-free).
  const stackerChallengers = challengers.map((c) => ({ id: c.id, label: c.label, weight: 1, model: c.model }));
  const logisticWeights = fitServingStacker(split.train, stackerChallengers, horizon);

  const settledTest = split.test.filter((s) => s.labels[horizon].up != null);
  const champScoresTest = settledTest.map((s) => normalizeChampionScore(s.championScore));
  const challengerScoresTest = challengers.map((c) => predictBatch(c.model, settledTest));
  const labels = settledTest.map((s) => (s.labels[horizon].up === 1 ? 1 : 0)) as (0 | 1)[];
  const returns = settledTest.map((s) => s.labels[horizon].forwardReturn);
  const dates = settledTest.map((s) => s.date);

  return {
    upThreshold,
    challengers,
    champScoresTest,
    challengerScoresTest,
    labels,
    returns,
    dates,
    logisticWeights,
  };
}

function aggregateFeatureImportance(
  challengers: { model: TrainedModel }[],
): { feature: string; importance: number }[] {
  const acc = new Map<string, number>();
  for (const c of challengers) {
    const m = c.model;
    const total = m.gainByFeature.reduce((a, b) => a + b, 0) || 1;
    m.featureNames.forEach((f, i) => {
      acc.set(f, (acc.get(f) ?? 0) + (m.gainByFeature[i] ?? 0) / total);
    });
  }
  const rows = [...acc.entries()].map(([feature, importance]) => ({ feature, importance }));
  const sum = rows.reduce((a, b) => a + b.importance, 0) || 1;
  return rows
    .map((r) => ({ feature: r.feature, importance: r.importance / sum }))
    .sort((a, b) => b.importance - a.importance);
}

// -------- Runner --------

export async function runAutoOptimization(
  base: DatasetParams,
  horizon: MlHorizon,
  options: AutoRunOptions = {},
): Promise<AutoRunOutput> {
  const signal = options.signal;
  const t0 = performance.now();
  const results: AutoResult[] = [];

  const totalCombos =
    AUTO_LABEL_THRESHOLDS.length *
    (AUTO_METHODS.length *
      AUTO_CHAMPION_WEIGHTS.length *
      AUTO_DECISION_THRESHOLDS.length *
      // gate is only swept for "gated"; others use a single value.
      (1 + 1 + AUTO_GATE_CONFIDENCES.length) /
      AUTO_METHODS.length);
  // Simpler exact count:
  const combosPerUt =
    AUTO_CHAMPION_WEIGHTS.length *
    AUTO_DECISION_THRESHOLDS.length *
    (1 /* weighted */ + AUTO_GATE_CONFIDENCES.length /* gated */ + 1 /* logistic */);
  const trueTotal = AUTO_LABEL_THRESHOLDS.length * combosPerUt;

  const bundles: UtBundle[] = [];
  let processed = 0;

  for (const uT of AUTO_LABEL_THRESHOLDS) {
    if (signal?.aborted) throw new MlAbortError();
    const bundle = await trainForUpThreshold(base, horizon, uT, options);
    bundles.push(bundle);

    options.onPhase?.(`Etiket %${uT}: kombinasyonlar değerlendiriliyor…`);
    // Sweep combos for this uT
    for (const method of AUTO_METHODS) {
      const gates = method === "gated" ? AUTO_GATE_CONFIDENCES : ([0.6] as readonly number[]);
      for (const cw of AUTO_CHAMPION_WEIGHTS) {
        for (const dt of AUTO_DECISION_THRESHOLDS) {
          for (const gc of gates) {
            if (signal?.aborted) throw new MlAbortError();
            const blended = blendWithMembers(
              method,
              cw,
              gc,
              bundle.champScoresTest,
              bundle.challengerScoresTest,
              bundle.challengers.map((c) => c.label),
              bundle.logisticWeights,
            );
            const metrics = computeMetrics(blended, bundle.labels, bundle.returns, bundle.dates, dt, horizon);
            results.push({
              combo: {
                method,
                upThreshold: uT,
                decisionThreshold: dt,
                gateConfidence: gc,
                championWeight: cw,
              },
              metrics,
            });
            processed++;
            if (processed % 250 === 0) {
              options.onProgress?.({
                processed,
                total: trueTotal,
                percent: Math.round((processed / trueTotal) * 100),
              });
              await new Promise((r) => setTimeout(r, 0));
            }
          }
        }
      }
    }
  }

  options.onProgress?.({ processed, total: trueTotal, percent: 100 });

  // Rank
  const byF1 = [...results].sort((a, b) => b.metrics.f1 - a.metrics.f1);
  const byRAR = [...results].sort(
    (a, b) => (b.metrics.riskAdjusted ?? -Infinity) - (a.metrics.riskAdjusted ?? -Infinity),
  );

  // Build artifacts for the F1-best combo
  const best = byF1[0];
  const bundle = bundles.find((b) => b.upThreshold === best.combo.upThreshold)!;
  const bestBlend = blendWithMembers(
    best.combo.method,
    best.combo.championWeight,
    best.combo.gateConfidence,
    bundle.champScoresTest,
    bundle.challengerScoresTest,
    bundle.challengers.map((c) => c.label),
    bundle.logisticWeights,
  );

  const bestArtifacts: AutoBestArtifacts = {
    blendedScores: bestBlend,
    labels: bundle.labels,
    returns: bundle.returns,
    dates: bundle.dates,
    featureImportance: aggregateFeatureImportance(bundle.challengers),
    logisticWeights: best.combo.method === "logistic" ? bundle.logisticWeights : null,
    challengerLabels: bundle.challengers.map((c) => c.label),
    challengerIds: bundle.challengers.map((c) => c.id),
    testSamples: bundle.labels.length,
  };

  const elapsedMs = performance.now() - t0;
  // suppress unused-warning helper
  void totalCombos;
  return { results: byF1, byRiskAdjusted: byRAR, best, bestArtifacts, totalCombos: trueTotal, elapsedMs };
}

// -------- Chart-ready aggregations from best artifacts --------

export interface BestCharts {
  equityCurve: { x: number; y: number }[];
  drawdownCurve: { x: number; y: number }[];
  rocCurve: { x: number; y: number }[];
  prCurve: { x: number; y: number }[];
  predictionHistogram: { bin: number; positives: number; negatives: number }[];
  confusion: { tp: number; fp: number; tn: number; fn: number };
}

export function buildBestCharts(
  best: AutoResult,
  art: AutoBestArtifacts,
): BestCharts {
  const dt = best.combo.decisionThreshold;
  // Confusion + prediction histogram
  const bins = 20;
  const hist = Array.from({ length: bins }, (_, i) => ({ bin: i, positives: 0, negatives: 0 }));
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (let i = 0; i < art.blendedScores.length; i++) {
    const s = art.blendedScores[i];
    const b = Math.min(bins - 1, Math.max(0, Math.floor(s * bins)));
    if (art.labels[i] === 1) hist[b].positives++;
    else hist[b].negatives++;
    const pred = s >= dt ? 1 : 0;
    if (pred === 1 && art.labels[i] === 1) tp++;
    else if (pred === 1 && art.labels[i] === 0) fp++;
    else if (pred === 0 && art.labels[i] === 0) tn++;
    else fn++;
  }

  // ROC / PR curves — score-thresholded step curves.
  const order = Array.from({ length: art.blendedScores.length }, (_, i) => i).sort(
    (a, b) => art.blendedScores[b] - art.blendedScores[a],
  );
  const pos = art.labels.reduce<number>((a, b) => a + b, 0);
  const neg = art.labels.length - pos;
  const roc: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  const pr: { x: number; y: number }[] = [];
  let cTp = 0,
    cFp = 0;
  for (let k = 0; k < order.length; k++) {
    if (art.labels[order[k]] === 1) cTp++;
    else cFp++;
    if (k + 1 < order.length && art.blendedScores[order[k + 1]] === art.blendedScores[order[k]]) continue;
    const recall = pos ? cTp / pos : 0;
    const precision = cTp + cFp ? cTp / (cTp + cFp) : 1;
    const fpr = neg ? cFp / neg : 0;
    roc.push({ x: fpr, y: recall });
    pr.push({ x: recall, y: precision });
  }

  // Equity + drawdown from time-ordered picks
  const picks: { d: string; r: number }[] = [];
  for (let i = 0; i < art.blendedScores.length; i++) {
    if (art.blendedScores[i] < dt) continue;
    const r = art.returns[i];
    if (r == null) continue;
    picks.push({ d: art.dates[i], r });
  }
  picks.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const equity: { x: number; y: number }[] = [];
  const drawdown: { x: number; y: number }[] = [];
  let cum = 0;
  let peak = 0;
  picks.forEach((p, i) => {
    cum += p.r;
    if (cum > peak) peak = cum;
    equity.push({ x: i, y: cum });
    drawdown.push({ x: i, y: cum - peak });
  });

  const thin = (arr: { x: number; y: number }[], max = 80) => {
    if (arr.length <= max) return arr;
    const step = arr.length / max;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
    out.push(arr[arr.length - 1]);
    return out;
  };

  return {
    equityCurve: equity,
    drawdownCurve: drawdown,
    rocCurve: thin(roc),
    prCurve: thin(pr),
    predictionHistogram: hist,
    confusion: { tp, fp, tn, fn },
  };
}
