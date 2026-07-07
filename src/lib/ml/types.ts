// ============================================================================
// ML Pipeline — shared contracts (FAZ 3).
//
// This module runs *entirely in parallel* with the live Rule Engine (Champion).
// It never mutates existing data or APIs. ML models start life strictly as
// Challengers; promotion to Champion is a manual decision (see
// champion-challenger.ts) — nothing here auto-switches the live system.
//
// Everything is pure, deterministic and dependency-free so it is trivially
// unit-testable and reproducible: the same data + the same seed always yields
// the same model and the same predictions.
// ============================================================================

/** Prediction horizons in trading days (identical to the backtest engine). */
export const ML_HORIZONS = [1, 3, 5, 10, 20] as const;
export type MlHorizon = (typeof ML_HORIZONS)[number];

/** Feature schema version — bump when the feature set changes. */
export const FEATURE_VERSION = "fv1";

/**
 * A named feature vector. Values may be null (missing) — the learner handles
 * missing values natively via a per-node default direction. Keyed by name so
 * feature *order* can never corrupt training or inference.
 */
export type FeatureVector = Record<string, number | null>;

/** Look-ahead-free labels for one horizon. */
export interface LabelSet {
  /** 1 if forward return exceeded the threshold, else 0. null if unsettled. */
  up: 0 | 1 | null;
  /** Realised forward return (%) at the horizon, or null if unsettled. */
  forwardReturn: number | null;
  /** Risk-adjusted forward return (return / volatility proxy), or null. */
  riskAdjusted: number | null;
}

/** One training row: features known at `date` + future-only labels. */
export interface Sample {
  symbol: string;
  date: string;
  features: FeatureVector;
  labels: Record<MlHorizon, LabelSet>;
  /** Legacy Rule-Engine score at this row (Champion reference only). */
  championScore: number | null;
}

/** Supported model families. New families slot in without touching callers. */
export type ModelType = "xgboost" | "lightgbm";

/** Which label a model is trained against. */
export type LabelType = "up";

/** Tunable hyper-parameters for the gradient-boosting learner. */
export interface ModelHyperParams {
  /** Number of boosting rounds (trees). */
  nTrees: number;
  /** Shrinkage applied to each tree's leaf weights. */
  learningRate: number;
  /** Max tree depth (binds for XGBoost level-wise growth). */
  maxDepth: number;
  /** Max leaves per tree (binds for LightGBM leaf-wise growth). */
  maxLeaves: number;
  /** Minimum sum of hessian required in a child (regularisation). */
  minChildWeight: number;
  /** L2 regularisation on leaf weights. */
  lambda: number;
  /** Minimum split gain (complexity penalty). */
  gamma: number;
  /** Histogram bins per feature. */
  maxBins: number;
  /** Row subsample ratio per tree (seeded, deterministic). */
  subsample: number;
  /** Feature subsample ratio per tree (seeded, deterministic). */
  colsample: number;
  /** RNG seed — fixing this guarantees reproducible training. */
  seed: number;
}

export interface ModelConfig {
  type: ModelType;
  label: string;
  params: ModelHyperParams;
}

/** A single decision-tree node in a trained model. */
export interface TreeNode {
  /** Leaf weight (already scaled by learningRate). Present iff leaf. */
  leaf?: number;
  /** Feature index into the model's `featureNames`. Present iff internal. */
  f?: number;
  /** Go left when bin <= `t` (bins are ordinal). Present iff internal. */
  t?: number;
  /** Missing values go left when true. Present iff internal. */
  ml?: boolean;
  l?: TreeNode;
  r?: TreeNode;
}

/** A fully trained, serialisable model. */
export interface TrainedModel {
  type: ModelType;
  label: string;
  version: string;
  featureVersion: string;
  /** Canonical feature order this model was trained on. */
  featureNames: string[];
  /** Per-feature bin edges (ascending). Length = featureNames.length. */
  binEdges: number[][];
  /** Log-odds base score added before any tree. */
  baseScore: number;
  trees: TreeNode[];
  /** Total split gain per feature index (feature importance). */
  gainByFeature: number[];
  params: ModelHyperParams;
  horizon: MlHorizon;
  labelType: LabelType;
  upThreshold: number;
  trainStart: string | null;
  trainEnd: string | null;
  trainSamples: number;
}

/** Classification + curve metrics from the Evaluator. */
export interface ClassificationMetrics {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  rocAuc: number;
  prAuc: number;
  /** Positive-class base rate (for PR-AUC context). */
  baseRate: number;
}

/** Financial performance of a model's positive calls. */
export interface FinancialMetrics {
  signals: number;
  avgReturn: number | null;
  medianReturn: number | null;
  hitRate: number | null;
  profitFactor: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
}

export interface CurvePoint {
  x: number;
  y: number;
}

/** Full evaluation report for one model on one dataset. */
export interface EvalReport {
  horizon: MlHorizon;
  n: number;
  classification: ClassificationMetrics;
  financial: FinancialMetrics;
  rocCurve: CurvePoint[];
  prCurve: CurvePoint[];
  /** Feature attribution (total split gain per feature, normalised 0-1). */
  featureImportance: { feature: string; importance: number }[];
}

/** A single train/validation/test partition, in strict chronological order. */
export interface DataSplit {
  train: Sample[];
  validation: Sample[];
  test: Sample[];
  trainRange: [string, string] | null;
  validationRange: [string, string] | null;
  testRange: [string, string] | null;
}

/** Progress callback payload used by long-running dataset / training tasks. */
export interface MlProgress {
  phase: string;
  processed: number;
  total: number;
  percent: number;
}

export class MlAbortError extends Error {
  constructor() {
    super("ML işlemi durduruldu");
    this.name = "MlAbortError";
  }
}
