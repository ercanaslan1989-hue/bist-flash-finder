// GBDT core — reproducibility, learning ability, and binning correctness.

import { describe, it, expect } from "vitest";
import { computeBinEdges, toBin, trainGBDT, evalTree, MISSING, mulberry32 } from "./gbdt";
import { makeLearnableDataset, FEATURES } from "./fixtures";

function bin(samples: ReturnType<typeof makeLearnableDataset>, names: string[], maxBins: number) {
  const edges = names.map((nm) => computeBinEdges(samples.map((s) => s.features[nm] ?? null), maxBins));
  const nF = names.length;
  const binned = new Int16Array(samples.length * nF);
  const labels = new Uint8Array(samples.length);
  for (let r = 0; r < samples.length; r++) {
    for (let f = 0; f < nF; f++) binned[r * nF + f] = toBin(samples[r].features[names[f]] ?? null, edges[f]);
    labels[r] = samples[r].labels[5].up === 1 ? 1 : 0;
  }
  return { binned, labels, nBins: edges.map((e) => e.length + 1), nF };
}

const PARAMS = {
  nTrees: 40,
  learningRate: 0.2,
  maxDepth: 4,
  maxLeaves: 31,
  minChildWeight: 2,
  lambda: 1,
  gamma: 0,
  maxBins: 32,
  subsample: 1,
  colsample: 1,
  seed: 123,
};

describe("gbdt core", () => {
  it("bins map monotonically and route missing to MISSING", () => {
    const edges = computeBinEdges([1, 2, 3, 4, 5, 6, 7, 8], 4);
    expect(edges.length).toBeGreaterThan(0);
    expect(toBin(1, edges)).toBeLessThanOrEqual(toBin(8, edges));
    expect(toBin(null, edges)).toBe(MISSING);
    expect(toBin(NaN, edges)).toBe(MISSING);
  });

  it("learns a known signal (train AUC-like separation)", () => {
    const data = makeLearnableDataset(500, 3);
    const { binned, labels, nBins, nF } = bin(data, FEATURES, PARAMS.maxBins);
    const { baseScore, trees } = trainGBDT(binned, labels, nF, nBins, PARAMS, "level");
    // Average predicted margin should be higher for positives than negatives.
    let posSum = 0, posN = 0, negSum = 0, negN = 0;
    for (let i = 0; i < labels.length; i++) {
      let m = baseScore;
      for (const t of trees) m += evalTree(t, binned, i, nF);
      if (labels[i] === 1) { posSum += m; posN++; } else { negSum += m; negN++; }
    }
    expect(posSum / posN).toBeGreaterThan(negSum / negN + 1);
  });

  it("is fully deterministic: same seed => identical trees", () => {
    const data = makeLearnableDataset(300, 9);
    const { binned, labels, nBins, nF } = bin(data, FEATURES, PARAMS.maxBins);
    const a = trainGBDT(binned, labels, nF, nBins, PARAMS, "leaf");
    const b = trainGBDT(binned, labels, nF, nBins, PARAMS, "leaf");
    expect(JSON.stringify(a.trees)).toBe(JSON.stringify(b.trees));
    expect(a.baseScore).toBe(b.baseScore);
  });

  it("mulberry32 is deterministic for a given seed", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});
