import { describe, expect, it } from "vitest";

import { VolumeScoreEngine, VOLUME_WEIGHT } from "./volume-engine";
import { makeContext } from "./fixtures";

describe("VolumeScoreEngine", () => {
  it("returns the uniform ScoreComponent shape", () => {
    const c = VolumeScoreEngine.score(makeContext());
    expect(c.weight).toBe(VOLUME_WEIGHT);
    expect(c.score).toBeGreaterThanOrEqual(0);
    expect(c.score).toBeLessThanOrEqual(100);
  });

  it("rewards rising OBV and punishes falling OBV", () => {
    const rising = VolumeScoreEngine.score(makeContext({ obv: "rising" })).score;
    const flat = VolumeScoreEngine.score(makeContext({ obv: "flat" })).score;
    const falling = VolumeScoreEngine.score(makeContext({ obv: "falling" })).score;
    expect(rising).toBeGreaterThan(flat);
    expect(falling).toBeLessThan(flat);
  });

  it("rewards strong volume expansion", () => {
    const strong = VolumeScoreEngine.score(makeContext({ volumeIncrease: 150 })).score;
    const dry = VolumeScoreEngine.score(makeContext({ volumeIncrease: -70 })).score;
    expect(strong).toBeGreaterThan(dry);
  });

  it("penalises thin liquidity", () => {
    const high = VolumeScoreEngine.score(makeContext({ liquidityLevel: "high" })).score;
    const thin = VolumeScoreEngine.score(makeContext({ liquidityLevel: "thin" })).score;
    expect(thin).toBeLessThan(high);
  });

  it("drops confidence when volume/liquidity data is missing", () => {
    const c = VolumeScoreEngine.score(makeContext({ volumeIncrease: null, liquidityValue: null }));
    // Only OBV remains available (1 of 3 inputs).
    expect(c.confidence).toBeCloseTo(1 / 3, 5);
  });
});
