// BacktestEngine tests — determinism, abort handling and end-to-end scoring.

import { describe, it, expect } from "vitest";
import { BacktestEngine } from "./backtest-engine";
import { DEFAULT_STRATEGIES, TechnicalOnlyStrategy } from "./strategies";
import { generateReport } from "./report-generator";
import { makeSymbol, uptrend } from "./fixtures";
import { DEFAULT_PARAMS, type BacktestParams } from "./types";

function universe() {
  return [
    makeSymbol(uptrend(120, 100, 0.9), { symbol: "AAA", startDate: "2024-01-01" }),
    makeSymbol(uptrend(120, 50, 0.3), { symbol: "BBB", startDate: "2024-01-01" }),
    makeSymbol(
      uptrend(120, 80, 1.4),
      { symbol: "CCC", startDate: "2024-01-01", legacy: { "2024-03-15": 82 } },
    ),
  ];
}

const params: BacktestParams = {
  ...DEFAULT_PARAMS,
  startDate: "2024-01-01",
  endDate: "2025-12-31",
  minScore: 55,
  target: 10,
  warmup: 50,
};

describe("BacktestEngine", () => {
  it("produces identical results for identical inputs (determinism)", async () => {
    const engine = new BacktestEngine(DEFAULT_STRATEGIES);
    const a = await engine.run(universe(), params);
    const b = await engine.run(universe(), params);
    expect(JSON.stringify(b.strategies)).toBe(JSON.stringify(a.strategies));
    expect(b.totalSignals).toBe(a.totalSignals);
  });

  it("generates signals and populates every horizon's metrics", async () => {
    const engine = new BacktestEngine([TechnicalOnlyStrategy]);
    const res = await engine.run(universe(), params);
    const s = res.strategies[0];
    expect(res.totalSignals).toBeGreaterThan(0);
    expect(s.metrics[5].signals).toBeGreaterThan(0);
    // A steady uptrend should score a strong hit rate on the technical engine.
    expect(s.metrics[5].hitRate ?? 0).toBeGreaterThan(50);
  });

  it("reports progress and reaches 100%", async () => {
    const engine = new BacktestEngine([TechnicalOnlyStrategy]);
    let last = 0;
    await engine.run(universe(), params, {
      chunkSize: 1,
      onProgress: (p) => {
        last = p.percent;
      },
    });
    expect(last).toBe(100);
  });

  it("aborts when the signal is triggered", async () => {
    const engine = new BacktestEngine(DEFAULT_STRATEGIES);
    const controller = new AbortController();
    controller.abort();
    await expect(
      engine.run(universe(), params, { signal: controller.signal }),
    ).rejects.toThrow(/durduruldu/);
  });

  it("ranks strategies deterministically in the report", async () => {
    const engine = new BacktestEngine(DEFAULT_STRATEGIES);
    const res = await engine.run(universe(), params);
    const report = generateReport(res);
    expect(report.ranked.length).toBe(DEFAULT_STRATEGIES.length);
    expect(report.ranked[0].rank).toBe(1);
    expect(report.best).not.toBeNull();
    // Ranking is monotonic in quality.
    for (let i = 1; i < report.ranked.length; i++) {
      expect(report.ranked[i - 1].quality).toBeGreaterThanOrEqual(report.ranked[i].quality);
    }
  });

  it("old-AI strategy only fires where historical watchlist scores exist", async () => {
    const engine = new BacktestEngine(DEFAULT_STRATEGIES);
    const res = await engine.run(universe(), params);
    const oldAi = res.strategies.find((s) => s.strategyId === "old_ai")!;
    // Only CCC has a legacy score (82) on 2024-03-15 ≥ minScore.
    for (const p of oldAi.predictions) {
      expect(p.symbol).toBe("CCC");
      expect(p.signalDate).toBe("2024-03-15");
    }
  });
});
