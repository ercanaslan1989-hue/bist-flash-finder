import { describe, expect, it } from "vitest";

import { TechnicalScoreEngine, TECHNICAL_WEIGHT } from "./technical-engine";
import { makeContext } from "./fixtures";

describe("TechnicalScoreEngine", () => {
  it("returns the uniform ScoreComponent shape", () => {
    const c = TechnicalScoreEngine.score(makeContext());
    expect(c).toHaveProperty("score");
    expect(c).toHaveProperty("confidence");
    expect(c).toHaveProperty("weight");
    expect(c).toHaveProperty("reasons");
    expect(c.weight).toBe(TECHNICAL_WEIGHT);
    expect(c.score).toBeGreaterThanOrEqual(0);
    expect(c.score).toBeLessThanOrEqual(100);
  });

  it("scores the neutral baseline deterministically at 50", () => {
    const c = TechnicalScoreEngine.score(makeContext());
    expect(c.score).toBe(50);
    expect(c.confidence).toBe(1);
  });

  it("penalises overbought RSI", () => {
    const healthy = TechnicalScoreEngine.score(makeContext({ rsi: 55 })).score;
    const overbought = TechnicalScoreEngine.score(makeContext({ rsi: 82 })).score;
    expect(overbought).toBeLessThan(healthy);
  });

  it("rewards a bullish MACD over a bearish one", () => {
    const bull = TechnicalScoreEngine.score(makeContext({ macdStatus: "bullish", macdHist: 1 })).score;
    const bear = TechnicalScoreEngine.score(makeContext({ macdStatus: "bearish", macdHist: -1 })).score;
    expect(bull).toBeGreaterThan(bear);
  });

  it("rewards a positive EMA20/EMA50 alignment", () => {
    const up = TechnicalScoreEngine.score(makeContext({ ema20: 110, ema50: 100 })).score;
    const down = TechnicalScoreEngine.score(makeContext({ ema20: 90, ema50: 100 })).score;
    expect(up).toBeGreaterThan(down);
  });

  it("lowers confidence when indicators are missing", () => {
    const c = TechnicalScoreEngine.score(
      makeContext({ rsi: null, macdHist: null, ema20: null, ema50: null, sma20: null, bollingerPctB: null }),
    );
    expect(c.confidence).toBe(0);
  });
});
