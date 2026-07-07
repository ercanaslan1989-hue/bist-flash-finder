// Evaluator + Champion–Challenger — metric correctness and comparison logic.

import { describe, it, expect } from "vitest";
import { rocAuc, evaluateModel } from "./evaluator";
import { compareToChampion } from "./champion-challenger";
import { trainModel, timeSeriesSplit } from "./trainer";
import { defaultConfig } from "./models";
import { makeLearnableDataset, FEATURES } from "./fixtures";

describe("evaluator metrics", () => {
  it("rocAuc = 1 for perfectly separable scores", () => {
    const scores = [0.1, 0.2, 0.8, 0.9];
    const labels = [0, 0, 1, 1];
    expect(rocAuc(scores, labels)).toBeCloseTo(1, 6);
  });

  it("rocAuc = 0.5 for random/degenerate cases", () => {
    expect(rocAuc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBeCloseTo(0.5, 6);
    expect(rocAuc([0.1, 0.9], [1, 1])).toBe(0.5); // one class only
  });

  it("rocAuc handles ties with midpoint ranks", () => {
    // scores: [0.5,0.5] for one pos one neg → AUC 0.5.
    expect(rocAuc([0.5, 0.5, 0.9], [0, 1, 1])).toBeGreaterThan(0.5);
  });

  it("produces a confusion matrix and bounded curve metrics", () => {
    const data = makeLearnableDataset(400, 11);
    const { train, test } = timeSeriesSplit(data, 0.7, 0);
    const model = trainModel(train, {
      config: defaultConfig("xgboost"),
      horizon: 5,
      upThreshold: 0,
      featureNames: FEATURES,
    });
    const r = evaluateModel(model, test, 5, 0.5);
    expect(r.classification.tp + r.classification.fp + r.classification.tn + r.classification.fn).toBe(r.n);
    expect(r.classification.prAuc).toBeGreaterThanOrEqual(0);
    expect(r.classification.prAuc).toBeLessThanOrEqual(1);
    expect(r.rocCurve.length).toBeGreaterThan(1);
    expect(r.featureImportance.length).toBe(FEATURES.length);
  });
});

describe("champion vs challenger", () => {
  it("compares on the same rows and flags candidates without auto-switching", () => {
    const data = makeLearnableDataset(600, 21);
    const { train, test } = timeSeriesSplit(data, 0.7, 0);
    const model = trainModel(train, {
      config: defaultConfig("lightgbm"),
      horizon: 5,
      upThreshold: 0,
      featureNames: FEATURES,
    });
    const cmp = compareToChampion(model, test, 5, 60, 0.5);
    expect(cmp.champion.id).toBe("rule_engine");
    expect(["champion", "challenger", "tie"]).toContain(cmp.winner);
    expect(typeof cmp.isCandidate).toBe("boolean");
    // Comparison never mutates the model or promotes it.
    expect(model.type).toBe("lightgbm");
  });
});
