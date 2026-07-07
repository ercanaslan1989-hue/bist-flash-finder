// Trainer — time-series splitting, walk-forward, reproducibility, and the key
// guarantee that FEATURE ORDER does not change predictions.

import { describe, it, expect } from "vitest";
import { trainModel, timeSeriesSplit, walkForwardSplits } from "./trainer";
import { predictProba, predictBatch } from "./predictor";
import { evaluateModel } from "./evaluator";
import { defaultConfig } from "./models";
import { makeLearnableDataset, FEATURES } from "./fixtures";

const req = (type: "xgboost" | "lightgbm") => ({
  config: { ...defaultConfig(type), params: { ...defaultConfig(type).params, nTrees: 40, seed: 5 } },
  horizon: 5 as const,
  upThreshold: 0,
  featureNames: FEATURES,
});

describe("trainer", () => {
  it("time-series split is chronological and non-overlapping", () => {
    const data = makeLearnableDataset(200, 1);
    const { train, validation, test } = timeSeriesSplit(data, 0.6, 0.2);
    expect(train.length + validation.length + test.length).toBe(200);
    expect(train[train.length - 1].date <= validation[0].date).toBe(true);
    expect(validation[validation.length - 1].date <= test[0].date).toBe(true);
  });

  it("walk-forward folds expand the training window", () => {
    const data = makeLearnableDataset(300, 2);
    const folds = walkForwardSplits(data, 4);
    expect(folds.length).toBe(4);
    for (let i = 1; i < folds.length; i++) {
      expect(folds[i].train.length).toBeGreaterThan(folds[i - 1].train.length);
    }
  });

  it("trains a model that beats random on held-out test (ROC-AUC > 0.7)", () => {
    const data = makeLearnableDataset(600, 4);
    const { train, test } = timeSeriesSplit(data, 0.7, 0);
    const model = trainModel(train, req("xgboost"));
    const report = evaluateModel(model, test, 5, 0.5);
    expect(report.classification.rocAuc).toBeGreaterThan(0.7);
  });

  it("is reproducible: same data + seed => identical predictions", () => {
    const data = makeLearnableDataset(300, 8);
    const { train, test } = timeSeriesSplit(data, 0.7, 0);
    const m1 = trainModel(train, req("lightgbm"));
    const m2 = trainModel(train, req("lightgbm"));
    expect(predictBatch(m1, test)).toEqual(predictBatch(m2, test));
  });

  it("prediction is INDEPENDENT of feature key order", () => {
    const data = makeLearnableDataset(300, 6);
    const { train, test } = timeSeriesSplit(data, 0.7, 0);
    const model = trainModel(train, req("xgboost"));
    const s = test[0];
    const shuffled = {
      f_weak: s.features.f_weak,
      f_signal: s.features.f_signal,
      f_noise: s.features.f_noise,
    };
    expect(predictProba(model, shuffled)).toBe(predictProba(model, s.features));
  });

  it("handles missing features via the learned default direction", () => {
    const data = makeLearnableDataset(300, 6);
    const { train } = timeSeriesSplit(data, 1, 0);
    const model = trainModel(train, req("xgboost"));
    const p = predictProba(model, { f_signal: null, f_noise: null, f_weak: null });
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
