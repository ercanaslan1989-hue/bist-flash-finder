// ============================================================================
// ML Pipeline — public surface (FAZ 3).
//
// A fully independent, deterministic, look-ahead-free machine-learning stack
// that trains Challenger models from the Feature Store and compares them to the
// live Rule Engine (Champion). Nothing here mutates existing data or APIs, and
// no model is ever auto-promoted to Champion.
//
// Pipeline: DatasetBuilder → FeatureSelector → (LabelGenerator) → Trainer →
//           Predictor → Evaluator → ModelRegistry/ModelStore → ChampionChallenger
//
// Extensible: a new family (CatBoost, RandomForest, Transformer, …) only needs
// an entry in models.ts — the trainer, predictor, evaluator and dashboard need
// no changes.
// ============================================================================

export * from "./types";

export {
  extractFeatures,
  allFeatureNames,
  featureLabel,
  FEATURE_LABELS,
  FEATURE_VERSION,
} from "./feature-vector";

export { generateLabels } from "./label-generator";

export {
  buildDataset,
  buildSamplesAsync,
  buildSamplesFromUniverse,
  fetchLatestSnapshotDate,
  DEFAULT_DATASET_PARAMS,
  type DatasetParams,
  type BuildOptions,
} from "./dataset-builder";

export {
  selectFeatures,
  DEFAULT_SELECTOR,
  type SelectorOptions,
} from "./feature-selector";

export {
  MODEL_DEFAULTS,
  DEFAULT_MODEL_TYPES,
  defaultConfig,
  growthFor,
} from "./models";

export {
  trainModel,
  timeSeriesSplit,
  walkForwardSplits,
  type TrainRequest,
} from "./trainer";

export {
  mulberry32,
  computeBinEdges,
  toBin,
  trainGBDT,
  evalTree,
  evalTreeRow,
  MISSING,
  type GrowthPolicy,
  type GBDTResult,
} from "./gbdt";

export {
  Predictor,
  predictProba,
  predictMargin,
  predictBatch,
} from "./predictor";

export {
  evaluateModel,
  rocAuc,
  importanceFromModel,
} from "./evaluator";

export {
  serializeModel,
  deserializeModel,
  modelSizeKb,
} from "./model-store";

export {
  saveModel,
  fetchModels,
  fetchModelMetrics,
  saveComparison,
  fetchComparisons,
  type SaveModelInput,
  type StoredModel,
  type StoredModelMetric,
  type StoredComparison,
} from "./model-registry";

export {
  compareToChampion,
  type Comparison,
  type SideMetrics,
} from "./champion-challenger";

export {
  blendScores,
  evaluateBlend,
  fitLogisticStacker,
  rankNormalize,
  type BlendMetrics,
  type EnsembleConfig,
  type EnsembleMember,
  type EnsembleMethod,
  type StackerOptions,
} from "./ensemble";

export {
  ModelServer,
  normalizeChampionScore,
  fitServingStacker,
  type ServingChallenger,
  type ServingConfig,
  type ServedPrediction,
  type ServedMemberScore,
} from "./model-server";

export {
  saveEnsemble,
  fetchEnsembles,
  setActiveEnsemble,
  type StoredEnsemble,
  type SaveEnsembleInput,
} from "./ensemble-registry";

export {
  buildServingConfig,
  buildActiveServer,
  selectActiveServer,
  loadActiveServer,
  servePredictions,
  servePrediction,
  type ActiveServer,
} from "./serving";
