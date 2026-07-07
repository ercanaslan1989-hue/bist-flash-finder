// ============================================================================
// ModelStore — (de)serialisation of a TrainedModel to a plain JSON blob.
//
// The blob is what the ModelRegistry persists (jsonb). Round-tripping is exact,
// so a stored model predicts identically to the freshly trained one.
// ============================================================================

import type { TrainedModel } from "./types";

/** Serialise a trained model to a JSON-safe object. */
export function serializeModel(model: TrainedModel): Record<string, unknown> {
  return {
    type: model.type,
    label: model.label,
    version: model.version,
    featureVersion: model.featureVersion,
    featureNames: model.featureNames,
    binEdges: model.binEdges,
    baseScore: model.baseScore,
    trees: model.trees,
    gainByFeature: model.gainByFeature,
    params: model.params,
    horizon: model.horizon,
    labelType: model.labelType,
    upThreshold: model.upThreshold,
    trainStart: model.trainStart,
    trainEnd: model.trainEnd,
    trainSamples: model.trainSamples,
  };
}

/** Reconstruct a trained model from a stored blob. */
export function deserializeModel(blob: Record<string, unknown>): TrainedModel {
  return blob as unknown as TrainedModel;
}

/** Approximate serialised size in KB (for UI sanity checks). */
export function modelSizeKb(model: TrainedModel): number {
  return Math.round((JSON.stringify(serializeModel(model)).length / 1024) * 10) / 10;
}
