// ============================================================================
// FeatureExtractor — maps a look-ahead-free ScoreContext to a numeric feature
// vector. The context itself is produced by the backtest engine's
// `buildContextAt`, which guarantees no future data leaks in. Therefore the
// features here are look-ahead-free by construction.
//
// Features are keyed by name (never by position) so a caller may pass features
// in any order; the learner canonicalises the order internally.
// ============================================================================

import type { ScoreContext } from "@/lib/scoring";
import type { MacdStatus, ObvTrend, LiquidityLevel } from "@/lib/indicators";
import { FEATURE_VERSION, type FeatureVector } from "./types";

export { FEATURE_VERSION };

function ratio(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

function encodeMacd(s: MacdStatus): number {
  return s === "bullish" ? 1 : s === "bearish" ? -1 : 0;
}

function encodeObv(o: ObvTrend): number {
  return o === "rising" ? 1 : o === "falling" ? -1 : 0;
}

function encodeLiquidity(l: LiquidityLevel): number {
  return l === "high" ? 3 : l === "medium" ? 2 : l === "low" ? 1 : 0;
}

const log10Safe = (x: number | null): number | null =>
  x == null ? null : Math.log10(Math.max(1, x));

/**
 * Canonical feature set. Adding/removing a key requires bumping
 * FEATURE_VERSION so the ModelRegistry records which schema a model used.
 */
export function extractFeatures(ctx: ScoreContext): FeatureVector {
  return {
    rsi: ctx.rsi,
    macd_hist: ctx.macdHist,
    macd_status: encodeMacd(ctx.macdStatus),
    ema20_close: ratio(ctx.ema20, ctx.lastClose),
    ema50_close: ratio(ctx.ema50, ctx.lastClose),
    ema20_ema50:
      ctx.ema20 != null && ctx.ema50 != null && ctx.ema50 !== 0
        ? (ctx.ema20 / ctx.ema50 - 1) * 100
        : null,
    sma20_close: ratio(ctx.sma20, ctx.lastClose),
    bollinger_pctb: ctx.bollingerPctB,
    ret5d: ctx.ret5d,
    ret20d: ctx.ret20d,
    daily_return: ctx.dailyReturn,
    rel_strength_20d: ctx.relStrength20d,
    obv_trend: encodeObv(ctx.obv),
    volume_increase: ctx.volumeIncrease,
    liquidity_log: log10Safe(ctx.liquidityValue),
    liquidity_level: encodeLiquidity(ctx.liquidityLevel),
    volatility: ctx.volatility,
    market_cap_log: log10Safe(ctx.marketCap),
  };
}

/** All feature names in canonical (sorted) order. */
export function allFeatureNames(): string[] {
  return Object.keys(extractFeatures({} as unknown as ScoreContext)).sort();
}

/** Turkish display labels for feature names (for dashboards). */
export const FEATURE_LABELS: Record<string, string> = {
  rsi: "RSI",
  macd_hist: "MACD Histogram",
  macd_status: "MACD Durumu",
  ema20_close: "EMA20 / Fiyat",
  ema50_close: "EMA50 / Fiyat",
  ema20_ema50: "EMA20 vs EMA50",
  sma20_close: "SMA20 / Fiyat",
  bollinger_pctb: "Bollinger %B",
  ret5d: "5g Getiri",
  ret20d: "20g Getiri",
  daily_return: "Günlük Getiri",
  rel_strength_20d: "Göreli Güç 20g",
  obv_trend: "OBV Eğilimi",
  volume_increase: "Hacim Artışı",
  liquidity_log: "Likidite (log)",
  liquidity_level: "Likidite Seviyesi",
  volatility: "Volatilite",
  market_cap_log: "Piyasa Değeri (log)",
};

export function featureLabel(name: string): string {
  return FEATURE_LABELS[name] ?? name;
}
