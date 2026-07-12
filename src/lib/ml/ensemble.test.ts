// ============================================================================
// Ensemble & Model Serving tests (FAZ 5).
//
// Verifies: deterministic/reproducible blending, correct blend maths for every
// method, look-ahead-free stacking (fit on train, apply on test), feature-order
// independence in serving, and that the Champion is never silently discarded.
// ============================================================================

import { describe, expect, it } from "vitest";

import {
  blendScores,
  evaluateBlend,
  fitLogisticStacker,
  rankNormalize,
  type EnsembleMember,
} from "./ensemble";
import { ModelServer, fitServingStacker, normalizeChampionScore } from "./model-server";
import { trainModel, timeSeriesSplit } from "./trainer";
import { defaultConfig } from "./models";
import { selectFeatures } from "./feature-selector";
import { makeLearnableDataset } from "./fixtures";
import type { MlHorizon, Sample, TrainedModel } from "./types";

const HORIZON: MlHorizon = 5;

function members(): EnsembleMember[] {
  return [
    { id: "rule_engine", label: "Champion", role: "champion", weight: 1, scores: [0.2, 0.8, 0.5, 0.9] },
    { id: "m1", label: "XGB", role: "challenger", weight: 1, scores: [0.6, 0.6, 0.4, 0.1] },
  ];
}

function trainChallenger(train: Sample[], type: "xgboost" | "lightgbm" = "xgboost"): TrainedModel {
  const featureNames = selectFeatures(train);
  return trainModel(train, {
    config: defaultConfig(type),
    horizon: HORIZON,
    upThreshold: 0,
    featureNames,
  });
}

describe("blend maths", () => {
  it("weighted blend is the normalised weighted average", () => {
    const out = blendScores(members(), { method: "weighted" });
    expect(out[0]).toBeCloseTo((0.2 + 0.6) / 2, 10);
    expect(out[1]).toBeCloseTo((0.8 + 0.6) / 2, 10);
    expect(out[3]).toBeCloseTo((0.9 + 0.1) / 2, 10);
  });

  it("respects unequal weights", () => {
    const m = members();
    m[0].weight = 3; // champion dominates
    const out = blendScores(m, { method: "weighted" });
    expect(out[0]).toBeCloseTo((3 * 0.2 + 1 * 0.6) / 4, 10);
  });

  it("max blend takes the most optimistic member", () => {
    const out = blendScores(members(), { method: "max" });
    expect(out).toEqual([0.6, 0.8, 0.5, 0.9]);
  });

  it("gated: champion decides when no challenger is confident", () => {
    const m: EnsembleMember[] = [
      { id: "c", label: "Champion", role: "champion", weight: 1, scores: [0.3, 0.7] },
      { id: "x", label: "X", role: "challenger", weight: 1, scores: [0.52, 0.48] }, // low confidence
    ];
    const out = blendScores(m, { method: "gated", gateConfidence: 0.6 });
    expect(out).toEqual([0.3, 0.7]);
  });

  it("gated: confident challenger participates", () => {
    const m: EnsembleMember[] = [
      { id: "c", label: "Champion", role: "champion", weight: 1, scores: [0.3] },
      { id: "x", label: "X", role: "challenger", weight: 1, scores: [0.95] }, // conf = 0.9 >= 0.6
    ];
    const out = blendScores(m, { method: "gated", gateConfidence: 0.6 });
    expect(out[0]).toBeCloseTo((0.3 + 0.95) / 2, 10);
  });

  it("rankNormalize averages ties and spans [0,1]", () => {
    expect(rankNormalize([10, 20, 30])).toEqual([0, 0.5, 1]);
    expect(rankNormalize([5, 5, 9])).toEqual([0.25, 0.25, 1]);
    expect(rankNormalize([7])).toEqual([0.5]);
  });
});

describe("evaluateBlend", () => {
  it("computes precision/return/hit-rate over settled picks only", () => {
    const scores = [0.9, 0.8, 0.4, 0.7];
    const labels: (0 | 1 | null)[] = [1, 0, 1, null];
    const returns: (number | null)[] = [5, -2, 3, 4];
    const m = evaluateBlend(scores, labels, returns, 0.5);
    // Picks: idx 0,1,3 (>=0.5). Settled-label picks: 0 (1), 1 (0) → precision 1/2.
    expect(m.precision).toBeCloseTo(0.5, 10);
    // Returns of picks: 5, -2, 4 → avg 7/3, 2 of 3 positive.
    expect(m.signals).toBe(3);
    expect(m.avgReturn).toBeCloseTo(7 / 3, 10);
    expect(m.hitRate).toBeCloseTo((2 / 3) * 100, 10);
  });
});

describe("logistic stacker (look-ahead-free)", () => {
  it("weights the informative member above the noise member", () => {
    // member0 perfectly predicts label; member1 is anti-correlated noise.
    const rows: number[][] = [];
    const labels: number[] = [];
    for (let i = 0; i < 200; i++) {
      const y = i % 2;
      rows.push([y ? 0.9 : 0.1, y ? 0.1 : 0.9]);
      labels.push(y);
    }
    const w = fitLogisticStacker(rows, labels, { iterations: 500 });
    expect(w[1]).toBeGreaterThan(0); // informative member positive
    expect(w[1]).toBeGreaterThan(w[2]); // above the anti-correlated one
  });

  it("is deterministic for the same inputs", () => {
    const rows = Array.from({ length: 50 }, (_, i) => [i / 50, 1 - i / 50]);
    const labels = rows.map((_, i) => (i % 3 === 0 ? 1 : 0));
    expect(fitLogisticStacker(rows, labels)).toEqual(fitLogisticStacker(rows, labels));
  });
});

describe("normalizeChampionScore", () => {
  it("maps 0-100 into [0,1] and clamps", () => {
    expect(normalizeChampionScore(50)).toBeCloseTo(0.5, 10);
    expect(normalizeChampionScore(0)).toBe(0);
    expect(normalizeChampionScore(100)).toBe(1);
    expect(normalizeChampionScore(150)).toBe(1);
    expect(normalizeChampionScore(null)).toBe(0.5);
  });
});

describe("ModelServer", () => {
  const data = makeLearnableDataset(500, 11);
  const split = timeSeriesSplit(data, 0.6, 0.2);
  const model = trainChallenger(split.train);

  it("champion-only server returns the normalised champion score", () => {
    const server = new ModelServer(
      { method: "weighted", horizon: HORIZON, threshold: 0.5, championWeight: 1 },
      [],
    );
    const preds = server.predictBatch(split.test);
    preds.forEach((p, i) => {
      expect(p.score).toBeCloseTo(normalizeChampionScore(split.test[i].championScore), 10);
      expect(p.decision).toBe(p.score >= 0.5);
    });
  });

  it("is deterministic and reproducible across runs", () => {
    const cfg = { method: "weighted" as const, horizon: HORIZON, threshold: 0.5, championWeight: 1 };
    const a = new ModelServer(cfg, [{ id: "m", label: "XGB", weight: 1, model }]);
    const b = new ModelServer(cfg, [{ id: "m", label: "XGB", weight: 1, model }]);
    expect(a.predictBatch(split.test).map((p) => p.score)).toEqual(
      b.predictBatch(split.test).map((p) => p.score),
    );
  });

  it("prediction is independent of feature key order", () => {
    const server = new ModelServer(
      { method: "weighted", horizon: HORIZON, threshold: 0.5, championWeight: 1 },
      [{ id: "m", label: "XGB", weight: 1, model }],
    );
    const s = split.test[0];
    const straight = server.predict(s.features, s.championScore);
    const shuffled = Object.fromEntries(Object.entries(s.features).reverse());
    const reordered = server.predict(shuffled, s.championScore);
    expect(reordered.score).toBeCloseTo(straight.score, 12);
  });

  it("always exposes the Champion as a member (never discarded)", () => {
    const server = new ModelServer(
      { method: "max", horizon: HORIZON, threshold: 0.5, championWeight: 0.001 },
      [{ id: "m", label: "XGB", weight: 5, model }],
    );
    const pred = server.predictBatch(split.test.slice(0, 1))[0];
    expect(pred.members.some((m) => m.role === "champion")).toBe(true);
  });

  it("blended ensemble beats a coin flip on the learnable signal", () => {
    const weights = fitServingStacker(split.train, [{ id: "m", label: "XGB", weight: 1, model }], HORIZON);
    const server = new ModelServer(
      {
        method: "logistic",
        horizon: HORIZON,
        threshold: 0.5,
        championWeight: 1,
        logisticWeights: weights,
      },
      [{ id: "m", label: "XGB", weight: 1, model }],
    );
    const metrics = server.evaluate(split.test);
    expect(metrics.signals).toBeGreaterThan(0);
    expect(metrics.precision ?? 0).toBeGreaterThan(0.5);
  });

  it("logistic stacker fit on train applied to test is stable", () => {
    const chal = [{ id: "m", label: "XGB", weight: 1, model }];
    const w1 = fitServingStacker(split.train, chal, HORIZON);
    const w2 = fitServingStacker(split.train, chal, HORIZON);
    expect(w1).toEqual(w2);
  });
});
