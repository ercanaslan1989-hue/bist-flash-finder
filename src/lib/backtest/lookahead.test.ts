// Look-ahead bias regression — the single most important backtest guarantee.
// If ANY future value leaks into a score, these tests must fail.

import { describe, it, expect } from "vitest";
import { buildContextAt, computeForward } from "./context";
import { makeSymbol, uptrend } from "./fixtures";

describe("look-ahead bias prevention", () => {
  it("context at day i is identical regardless of future prices", () => {
    const base = uptrend(60, 100, 0.8);

    // Same history [0..40], wildly different futures [41..].
    const calm = makeSymbol([...base]);
    const crash = makeSymbol(
      base.map((c, i) => (i > 40 ? c * 0.4 : c)), // future crash
    );
    const spike = makeSymbol(
      base.map((c, i) => (i > 40 ? c * 3 : c)), // future spike
    );

    const i = 40;
    const a = buildContextAt(calm, i);
    const b = buildContextAt(crash, i);
    const c = buildContextAt(spike, i);

    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("context never reads an index greater than i", () => {
    // Poison every future close with NaN; a leak would make indicators NaN.
    const closes = uptrend(60, 100, 1);
    const i = 45;
    const poisoned = closes.map((c, idx) => (idx > i ? NaN : c));
    const sym = makeSymbol(poisoned);
    const ctx = buildContextAt(sym, i);

    expect(Number.isNaN(ctx.rsi ?? 0)).toBe(false);
    expect(Number.isNaN(ctx.lastClose ?? 0)).toBe(false);
    expect(Number.isNaN(ctx.ret5d ?? 0)).toBe(false);
    expect(ctx.macdStatus).toBeDefined();
  });

  it("forward outcome only uses days after the signal", () => {
    // Flat until i, then +10% steps → target reachable only in the future.
    const closes = [...Array(50).fill(100), 110, 121, 133.1];
    const sym = makeSymbol(closes);
    const fwd = computeForward(sym, 49, 10);

    expect(fwd.entryClose).toBe(100);
    expect(fwd.ret1d).toBeCloseTo(10, 5);
    expect(fwd.hit).toBe(true);
    expect(fwd.daysToHit).toBe(1);
    expect(fwd.maxRet).toBeCloseTo(33.1, 3);
  });

  it("forward returns are null when the horizon exceeds available data", () => {
    const closes = uptrend(52, 100, 1); // only 2 sessions after index 49
    const sym = makeSymbol(closes);
    const fwd = computeForward(sym, 49, 10);
    expect(fwd.ret1d).not.toBeNull();
    expect(fwd.ret10d).toBeNull();
    expect(fwd.ret20d).toBeNull();
  });
});
