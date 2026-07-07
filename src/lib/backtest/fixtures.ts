// Test fixtures — deterministic synthetic history builders for the backtest.

import type { PreparedSymbol } from "./context";
import type { Prediction } from "./types";

export interface MakeSymbolOpts {
  symbol?: string;
  startDate?: string; // ISO
  volumes?: number[];
  marketRets?: number[];
  volRatio20d?: (number | null)[];
  tradedValue?: (number | null)[];
  marketValue?: (number | null)[];
  legacy?: Record<string, number>; // date -> legacy score
}

/** Consecutive ISO dates (weekend-agnostic; fine for deterministic tests). */
export function isoDates(start: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(start);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Build a PreparedSymbol from a close-price path, deriving daily returns. */
export function makeSymbol(closes: number[], opts: MakeSymbolOpts = {}): PreparedSymbol {
  const dates = isoDates(opts.startDate ?? "2024-01-01", closes.length);
  const rets = closes.map((c, i) => (i === 0 ? 0 : (c / closes[i - 1] - 1) * 100));
  const legacyByDate = new Map<string, number>();
  if (opts.legacy) for (const [d, v] of Object.entries(opts.legacy)) legacyByDate.set(d, v);
  return {
    symbol: opts.symbol ?? "TEST",
    sector: null,
    dates,
    closes,
    rets,
    volumes: opts.volumes ?? closes.map(() => 1_000_000),
    volRatio20d: opts.volRatio20d ?? closes.map(() => 1.2),
    tradedValue: opts.tradedValue ?? closes.map(() => 300_000_000),
    marketValue: opts.marketValue ?? closes.map(() => 5_000_000_000),
    marketRets: opts.marketRets ?? closes.map(() => 0),
    legacyByDate,
  };
}

/** A smooth uptrend of `n` sessions starting at `base`, +`step`% each day. */
export function uptrend(n: number, base = 100, stepPct = 1): number[] {
  const closes = [base];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * (1 + stepPct / 100));
  return closes;
}

/** Minimal prediction factory for analyzer tests. */
export function makePrediction(p: Partial<Prediction> & { signalDate: string }): Prediction {
  return {
    strategyId: "test",
    score: 70,
    symbol: "TEST",
    signalDate: p.signalDate,
    entryClose: 100,
    ret1d: null,
    ret3d: null,
    ret5d: null,
    ret10d: null,
    ret20d: null,
    maxRet: 0,
    hit: false,
    daysToHit: null,
    ...p,
  };
}
