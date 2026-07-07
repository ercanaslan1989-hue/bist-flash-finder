// ============================================================================
// Trainer — time-series-aware training of a GBDT Challenger model.
//
// CRITICAL: splitting is chronological, never random. Train uses the earliest
// period, validation the middle, test the most recent — so evaluation always
// simulates predicting the future from the past. Walk-forward (expanding
// window) folds are supported for robust out-of-sample assessment.
//
// The trained model records its exact feature order + bin edges so inference is
// fully order-independent and reproducible.
// ============================================================================

import { computeBinEdges, toBin, trainGBDT } from "./gbdt";
import { growthFor } from "./models";
import { selectFeatures } from "./feature-selector";
import {
  FEATURE_VERSION,
  type DataSplit,
  type MlHorizon,
  type ModelConfig,
  type Sample,
  type TrainedModel,
} from "./types";

/** Chronological range of a sample list, or null when empty. */
function range(samples: Sample[]): [string, string] | null {
  if (samples.length === 0) return null;
  return [samples[0].date, samples[samples.length - 1].date];
}

/**
 * Single chronological split. `trainRatio`/`valRatio` are fractions of the
 * chronologically-ordered samples; the remainder is the test set.
 */
export function timeSeriesSplit(
  samples: Sample[],
  trainRatio = 0.6,
  valRatio = 0.2,
): DataSplit {
  const ordered = [...samples].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const nTrain = Math.floor(ordered.length * trainRatio);
  const nVal = Math.floor(ordered.length * valRatio);
  const train = ordered.slice(0, nTrain);
  const validation = ordered.slice(nTrain, nTrain + nVal);
  const test = ordered.slice(nTrain + nVal);
  return {
    train,
    validation,
    test,
    trainRange: range(train),
    validationRange: range(validation),
    testRange: range(test),
  };
}

/**
 * Expanding-window walk-forward folds. Each fold trains on everything up to a
 * cut point and tests on the following block; the training window grows.
 */
export function walkForwardSplits(samples: Sample[], folds = 4): DataSplit[] {
  const ordered = [...samples].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = ordered.length;
  const out: DataSplit[] = [];
  if (folds < 1 || n < folds + 1) return out;
  const block = Math.floor(n / (folds + 1));
  for (let k = 1; k <= folds; k++) {
    const trainEnd = block * k;
    const testEnd = k === folds ? n : block * (k + 1);
    const train = ordered.slice(0, trainEnd);
    const test = ordered.slice(trainEnd, testEnd);
    if (train.length === 0 || test.length === 0) continue;
    out.push({
      train,
      validation: [],
      test,
      trainRange: range(train),
      validationRange: null,
      testRange: range(test),
    });
  }
  return out;
}

export interface TrainRequest {
  config: ModelConfig;
  horizon: MlHorizon;
  upThreshold: number;
  /** Explicit feature list; when omitted, FeatureSelector runs on `train`. */
  featureNames?: string[];
}

/** Build the binned training matrix + labels for a horizon. */
function binMatrix(
  samples: Sample[],
  featureNames: string[],
  binEdges: number[][],
  horizon: MlHorizon,
): { binned: Int16Array; labels: Uint8Array; nBins: number[] } {
  // Keep only rows whose label at this horizon is settled.
  const rows = samples.filter((s) => s.labels[horizon].up != null);
  const nF = featureNames.length;
  const binned = new Int16Array(rows.length * nF);
  const labels = new Uint8Array(rows.length);
  for (let r = 0; r < rows.length; r++) {
    for (let f = 0; f < nF; f++) {
      binned[r * nF + f] = toBin(rows[r].features[featureNames[f]] ?? null, binEdges[f]);
    }
    labels[r] = rows[r].labels[horizon].up === 1 ? 1 : 0;
  }
  const nBins = binEdges.map((e) => e.length + 1);
  return { binned, labels, nBins };
}

/** Train one Challenger model on a train split (pure + deterministic). */
export function trainModel(train: Sample[], req: TrainRequest): TrainedModel {
  const featureNames = (req.featureNames ?? selectFeatures(train)).slice().sort((a, b) =>
    a.localeCompare(b),
  );

  // Compute bin edges from the TRAIN split only (no leakage).
  const settled = train.filter((s) => s.labels[req.horizon].up != null);
  const binEdges = featureNames.map((name) =>
    computeBinEdges(
      settled.map((s) => s.features[name] ?? null),
      req.config.params.maxBins,
    ),
  );

  const { binned, labels, nBins } = binMatrix(settled, featureNames, binEdges, req.horizon);
  const growth = growthFor(req.config.type);
  const { baseScore, trees, gainByFeature } = trainGBDT(
    binned,
    labels,
    featureNames.length,
    nBins,
    req.config.params,
    growth,
  );

  const r = range(settled);
  return {
    type: req.config.type,
    label: req.config.label,
    version: `${req.config.type}-h${req.horizon}-${Date.now()}`,
    featureVersion: FEATURE_VERSION,
    featureNames,
    binEdges,
    baseScore,
    trees,
    gainByFeature,
    params: req.config.params,
    horizon: req.horizon,
    labelType: "up",
    upThreshold: req.upThreshold,
    trainStart: r?.[0] ?? null,
    trainEnd: r?.[1] ?? null,
    trainSamples: settled.length,
  };
}
