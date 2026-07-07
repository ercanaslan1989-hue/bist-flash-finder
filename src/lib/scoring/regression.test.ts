import { describe, expect, it } from "vitest";

import { computeFinalScore } from "./index";
import { makeContext } from "./fixtures";
import type { ScoreContext } from "./types";

// Regression tests: guarantee the new engine runs *in parallel* with the legacy
// SQL AI score without ever changing it, stays deterministic, and produces
// stable results across representative market scenarios. These act as the
// golden anchors before we later swap or extend module logic.

describe("Scoring engine regression / backward-compat", () => {
  it("never mutates the legacy AI score (pure passthrough)", () => {
    for (const legacy of [0, 25, 50, 75, 100]) {
      const f = computeFinalScore(makeContext({ legacyAiScore: legacy }));
      expect(f.legacyScore).toBe(legacy);
    }
  });

  it("is deterministic for identical inputs", () => {
    const ctx = makeContext({ rsi: 62, obv: "rising", volatility: 55 });
    const a = computeFinalScore(ctx);
    const b = computeFinalScore(ctx);
    expect(a).toEqual(b);
  });

  it("does not read or mutate the input context object", () => {
    const ctx = makeContext();
    const snapshot = JSON.stringify(ctx);
    computeFinalScore(ctx);
    expect(JSON.stringify(ctx)).toBe(snapshot);
  });

  const scenarios: Array<{ name: string; ctx: Partial<ScoreContext>; expected: number }> = [
    { name: "neutral baseline", ctx: {}, expected: 62 },
    {
      name: "strong confirmed uptrend",
      ctx: {
        rsi: 60,
        macdStatus: "bullish",
        macdHist: 2,
        ema20: 115,
        ema50: 100,
        sma20: 105,
        lastClose: 118,
        bollingerPctB: 70,
        obv: "rising",
        volumeIncrease: 140,
        liquidityLevel: "high",
        volatility: 45,
        ret5d: 8,
        ret20d: 18,
      },
      expected: 91,
    },
    {
      name: "overbought exhausted spike",
      ctx: {
        rsi: 84,
        macdStatus: "bullish",
        macdHist: 1,
        bollingerPctB: 112,
        obv: "falling",
        volumeIncrease: -60,
        liquidityLevel: "thin",
        liquidityValue: 5_000_000,
        volatility: 150,
        ret5d: 46,
        ret20d: 60,
        dailyReturn: -5,
      },
      expected: 18,
    },
  ];

  for (const s of scenarios) {
    it(`stable golden score: ${s.name}`, () => {
      const f = computeFinalScore(makeContext(s.ctx));
      expect(f.total).toBe(s.expected);
    });
  }

  it("bullish setups outrank exhausted spikes", () => {
    const strong = computeFinalScore(makeContext(scenarios[1].ctx)).total;
    const weak = computeFinalScore(makeContext(scenarios[2].ctx)).total;
    expect(strong).toBeGreaterThan(weak);
  });
});
