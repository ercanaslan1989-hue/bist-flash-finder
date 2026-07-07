// PerformanceAnalyzer unit tests — deterministic metric math.

import { describe, it, expect } from "vitest";
import { analyzeHorizon } from "./performance-analyzer";
import { makePrediction } from "./fixtures";

describe("analyzeHorizon", () => {
  it("computes hit rate, average and median on the 5-day horizon", () => {
    const preds = [
      makePrediction({ signalDate: "2024-01-01", ret5d: 10 }),
      makePrediction({ signalDate: "2024-01-02", ret5d: -4 }),
      makePrediction({ signalDate: "2024-01-03", ret5d: 6 }),
      makePrediction({ signalDate: "2024-01-04", ret5d: -2 }),
    ];
    const m = analyzeHorizon(preds, 5);
    expect(m.signals).toBe(4);
    expect(m.hitRate).toBe(50); // 2 of 4 positive
    expect(m.avgReturn).toBeCloseTo(2.5, 5);
    expect(m.medianReturn).toBeCloseTo(2, 5); // median of [-4,-2,6,10] = (−2+6)/2 = 2
  });

  it("profit factor = gross win / gross loss", () => {
    const preds = [
      makePrediction({ signalDate: "2024-01-01", ret5d: 8 }),
      makePrediction({ signalDate: "2024-01-02", ret5d: 4 }),
      makePrediction({ signalDate: "2024-01-03", ret5d: -3 }),
    ];
    const m = analyzeHorizon(preds, 5);
    expect(m.profitFactor).toBeCloseTo(12 / 3, 5);
  });

  it("computes max drawdown of the additive equity curve", () => {
    // returns in date order: +10, -6, -6, +4 → cum: 10,4,-2,2 ; peak 10 → dd -12
    const preds = [
      makePrediction({ signalDate: "2024-01-01", ret5d: 10 }),
      makePrediction({ signalDate: "2024-01-02", ret5d: -6 }),
      makePrediction({ signalDate: "2024-01-03", ret5d: -6 }),
      makePrediction({ signalDate: "2024-01-04", ret5d: 4 }),
    ];
    const m = analyzeHorizon(preds, 5);
    expect(m.maxDrawdown).toBeCloseTo(-12, 5);
  });

  it("tracks best winning and worst losing streaks in date order", () => {
    const preds = [
      makePrediction({ signalDate: "2024-01-01", ret5d: 3 }),
      makePrediction({ signalDate: "2024-01-02", ret5d: 2 }),
      makePrediction({ signalDate: "2024-01-03", ret5d: -1 }),
      makePrediction({ signalDate: "2024-01-04", ret5d: -2 }),
      makePrediction({ signalDate: "2024-01-05", ret5d: -3 }),
      makePrediction({ signalDate: "2024-01-06", ret5d: 5 }),
    ];
    const m = analyzeHorizon(preds, 5);
    expect(m.bestStreak).toBe(2);
    expect(m.worstStreak).toBe(3);
  });

  it("average holding uses days-to-hit when the target was reached", () => {
    const preds = [
      makePrediction({ signalDate: "2024-01-01", ret5d: 12, hit: true, daysToHit: 2 }),
      makePrediction({ signalDate: "2024-01-02", ret5d: -1, hit: false, daysToHit: null }),
    ];
    const m = analyzeHorizon(preds, 5);
    // hit → 2 days, miss → full horizon (5) ; avg = 3.5
    expect(m.avgHolding).toBeCloseTo(3.5, 5);
  });

  it("ignores predictions without a realised return at the horizon", () => {
    const preds = [
      makePrediction({ signalDate: "2024-01-01", ret5d: 5 }),
      makePrediction({ signalDate: "2024-01-02", ret5d: null }), // pending at 5d
    ];
    const m = analyzeHorizon(preds, 5);
    expect(m.signals).toBe(1);
  });
});
