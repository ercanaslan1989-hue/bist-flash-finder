// ============================================================================
// Model catalog — default hyper-parameters for each supported family, plus the
// mapping from ModelType to a GBDT growth policy. New families (CatBoost,
// RandomForest, …) are added here without touching the trainer or callers.
// ============================================================================

import type { GrowthPolicy } from "./gbdt";
import type { ModelConfig, ModelHyperParams, ModelType } from "./types";

const BASE: ModelHyperParams = {
  nTrees: 120,
  learningRate: 0.1,
  maxDepth: 4,
  maxLeaves: 31,
  minChildWeight: 5,
  lambda: 1,
  gamma: 0,
  maxBins: 64,
  subsample: 1,
  colsample: 1,
  seed: 42,
};

/**
 * Default config per family. XGBoost binds on depth (level-wise); LightGBM
 * binds on leaf count (leaf-wise, deeper unbalanced trees).
 */
export const MODEL_DEFAULTS: Record<ModelType, ModelConfig> = {
  xgboost: {
    type: "xgboost",
    label: "XGBoost (level-wise)",
    params: { ...BASE, maxDepth: 4, maxLeaves: 9999 },
  },
  lightgbm: {
    type: "lightgbm",
    label: "LightGBM (leaf-wise)",
    params: { ...BASE, maxDepth: 12, maxLeaves: 31 },
  },
};

/** GBDT growth policy for a family. */
export function growthFor(type: ModelType): GrowthPolicy {
  return type === "lightgbm" ? "leaf" : "level";
}

/** The set of Challenger families trained by default in the dashboard. */
export const DEFAULT_MODEL_TYPES: ModelType[] = ["xgboost", "lightgbm"];

export function defaultConfig(type: ModelType): ModelConfig {
  return {
    type: MODEL_DEFAULTS[type].type,
    label: MODEL_DEFAULTS[type].label,
    params: { ...MODEL_DEFAULTS[type].params },
  };
}
