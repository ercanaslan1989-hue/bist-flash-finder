import { describe, expect, it } from "vitest";

import { RiskScoreEngine, RISK_WEIGHT } from "./risk-engine";
import { makeContext } from "./fixtures";

describe("RiskScoreEngine", () => {
  it("returns the uniform ScoreComponent shape (higher = safer)", () => {
    const c = RiskScoreEngine.score(makeContext());
    expect(c.weight).toBe(RISK_WEIGHT);
    expect(c.score).toBe(100); // calm baseline = lowest risk
    expect(c.confidence).toBe(1);
  });

  it("lowers the score for high volatility", () => {
    const calm = RiskScoreEngine.score(makeContext({ volatility: 30 })).score;
    const wild = RiskScoreEngine.score(makeContext({ volatility: 150 })).score;
    expect(wild).toBeLessThan(calm);
  });

  it("penalises short-term overextension", () => {
    const steady = RiskScoreEngine.score(makeContext({ ret5d: 5 })).score;
    const parabolic = RiskScoreEngine.score(makeContext({ ret5d: 45 })).score;
    expect(parabolic).toBeLessThan(steady);
  });

  it("penalises a hard down day right before the signal", () => {
    const ok = RiskScoreEngine.score(makeContext({ dailyReturn: 0.5 })).score;
    const crash = RiskScoreEngine.score(makeContext({ dailyReturn: -6 })).score;
    expect(crash).toBeLessThan(ok);
  });

  it("penalises thin liquidity without consuming a confidence slot", () => {
    const thin = RiskScoreEngine.score(makeContext({ liquidityLevel: "thin" }));
    const medium = RiskScoreEngine.score(makeContext({ liquidityLevel: "medium" }));
    expect(thin.score).toBeLessThan(medium.score);
    expect(thin.confidence).toBe(medium.confidence);
  });
});
