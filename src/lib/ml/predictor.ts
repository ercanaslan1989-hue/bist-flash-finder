// ============================================================================
// Predictor — applies a TrainedModel to feature vectors.
//
// Order-independence guarantee: the incoming FeatureVector is looked up BY NAME
// against the model's stored `featureNames`, then binned with the model's own
// `binEdges`. So a caller may pass features in any order (or add/remove extra
// keys) and the prediction is unchanged. Missing features become MISSING bins,
// handled by each node's learned default direction.
// ============================================================================

import { evalTreeRow, sigmoid, toBin } from "./gbdt";
import type { FeatureVector, Sample, TrainedModel } from "./types";

/** Bin a single named feature vector into the model's feature order. */
function binRow(model: TrainedModel, features: FeatureVector): Int16Array {
  const row = new Int16Array(model.featureNames.length);
  for (let f = 0; f < model.featureNames.length; f++) {
    row[f] = toBin(features[model.featureNames[f]] ?? null, model.binEdges[f]);
  }
  return row;
}

/** Raw margin (log-odds) for a feature vector. */
export function predictMargin(model: TrainedModel, features: FeatureVector): number {
  const row = binRow(model, features);
  let m = model.baseScore;
  for (const tree of model.trees) m += evalTreeRow(tree, row);
  return m;
}

/** Probability of the positive ("up") class for a feature vector. */
export function predictProba(model: TrainedModel, features: FeatureVector): number {
  return sigmoid(predictMargin(model, features));
}

/** Batch probabilities for many samples (order preserved). */
export function predictBatch(model: TrainedModel, samples: Sample[]): number[] {
  return samples.map((s) => predictProba(model, s.features));
}

export class Predictor {
  constructor(private readonly model: TrainedModel) {}
  proba(features: FeatureVector): number {
    return predictProba(this.model, features);
  }
  batch(samples: Sample[]): number[] {
    return predictBatch(this.model, samples);
  }
}
