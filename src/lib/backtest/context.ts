// Look-ahead-free context construction for the backtest.
//
// `buildContextAt(sym, i)` returns the exact same `ScoreContext` the live app
// would have produced on day `i`, using ONLY series values at indices <= i.
// This is the single choke point that guarantees no future information leaks
// into a score — the look-ahead test asserts it directly.

import {
  rsi,
  macd,
  ema,
  sma,
  bollinger,
  volatility,
  obvTrend,
  relativeStrength,
  liquidityTier,
} from "@/lib/indicators";
import type { ScoreContext } from "@/lib/scoring";
import type { Forward } from "./types";

/** All per-symbol series needed to replay history, aligned by index. */
export interface PreparedSymbol {
  symbol: string;
  sector: string | null;
  dates: string[];
  closes: number[];
  rets: number[]; // daily_return_pct (0 when null)
  volumes: number[];
  volRatio20d: (number | null)[];
  tradedValue: (number | null)[];
  marketValue: (number | null)[];
  /** Market average daily return aligned to this symbol's dates. */
  marketRets: number[];
  /** Legacy v1.0 AI score keyed by score_date (only flagged days present). */
  legacyByDate: Map<string, number>;
}

function sumLast(arr: number[], n: number, endInclusive: number): number | null {
  if (endInclusive < 0) return null;
  const start = Math.max(0, endInclusive - n + 1);
  let s = 0;
  for (let i = start; i <= endInclusive; i++) s += arr[i];
  return s;
}

/**
 * Build the ScoreContext for `sym` as of index `i`. Reads only `[0..i]`.
 */
export function buildContextAt(sym: PreparedSymbol, i: number): ScoreContext {
  // Historical slices — everything strictly up to and including day i.
  const closes = sym.closes.slice(0, i + 1);
  const rets = sym.rets.slice(0, i + 1);
  const volumes = sym.volumes.slice(0, i + 1);
  const marketRets = sym.marketRets.slice(0, i + 1);

  const m = macd(closes);
  const liquidityValue = sym.tradedValue[i] ?? null;
  const volRatio = sym.volRatio20d[i];
  const volumeIncrease = volRatio != null ? (volRatio - 1) * 100 : null;
  const liquidityLevel = liquidityTier(liquidityValue).level;

  return {
    symbol: sym.symbol,
    lastClose: closes[closes.length - 1] ?? null,
    rsi: rsi(closes),
    macdStatus: m.status,
    macdHist: m.hist,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    sma20: sma(closes, 20),
    bollingerPctB: bollinger(closes).pctB,
    ret5d: sumLast(rets, 5, i),
    ret20d: sumLast(rets, 20, i),
    dailyReturn: rets[i] ?? null,
    relStrength20d: relativeStrength(rets, marketRets, 20),
    obv: obvTrend(closes, volumes),
    volumeIncrease,
    liquidityValue,
    liquidityLevel,
    volatility: volatility(rets),
    marketCap: sym.marketValue[i] ?? null,
    sector: sym.sector,
    kapCount: null,
    // Reference-only: never used for future-based decisions.
    legacyAiScore: sym.legacyByDate.get(sym.dates[i]) ?? 0,
  };
}

/**
 * Compute the strategy-independent forward outcome of a signal at index `i`.
 * Uses only days AFTER the signal (`i+1 .. i+20`).
 */
export function computeForward(
  sym: PreparedSymbol,
  i: number,
  target: number,
): Forward {
  const entry = sym.closes[i];
  const last = sym.closes.length - 1;
  const retAt = (n: number): number | null => {
    const j = i + n;
    if (j > last) return null;
    return (sym.closes[j] / entry - 1) * 100;
  };

  let maxRet = 0;
  let hit = false;
  let daysToHit: number | null = null;
  const windowEnd = Math.min(i + 20, last);
  for (let j = i + 1; j <= windowEnd; j++) {
    const cum = (sym.closes[j] / entry - 1) * 100;
    if (cum > maxRet) maxRet = cum;
    if (!hit && cum >= target) {
      hit = true;
      daysToHit = j - i;
    }
  }

  return {
    symbol: sym.symbol,
    signalDate: sym.dates[i],
    entryClose: entry,
    ret1d: retAt(1),
    ret3d: retAt(3),
    ret5d: retAt(5),
    ret10d: retAt(10),
    ret20d: retAt(20),
    maxRet,
    hit,
    daysToHit,
  };
}
