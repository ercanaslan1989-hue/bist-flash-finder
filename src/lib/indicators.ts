// Pure, dependency-free technical indicators + AI scoring helpers.
// All indicators are derived client-side from the stored daily close/return
// history (the database is never modified). Where only close prices are
// available, indicators use a close-based approximation (noted in the UI).

export type Series = number[];

export function sma(values: Series, period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

function emaSeries(values: Series, period: number): Series {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: Series = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(values: Series, period: number): number | null {
  if (values.length < period) return null;
  const s = emaSeries(values, period);
  return s[s.length - 1] ?? null;
}

/** Wilder's RSI on close prices. Returns 0-100 or null. */
export function rsi(closes: Series, period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type MacdStatus = "bullish" | "bearish" | "neutral";

export interface MacdResult {
  macd: number | null;
  signal: number | null;
  hist: number | null;
  status: MacdStatus;
}

/** MACD(12,26,9) on close prices. */
export function macd(closes: Series): MacdResult {
  if (closes.length < 35) return { macd: null, signal: null, hist: null, status: "neutral" };
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine: Series = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalLine = emaSeries(macdLine, 9);
  const m = macdLine[macdLine.length - 1];
  const s = signalLine[signalLine.length - 1];
  const hist = m - s;
  let status: MacdStatus = "neutral";
  if (hist > 0 && m > 0) status = "bullish";
  else if (hist < 0 && m < 0) status = "bearish";
  else status = hist >= 0 ? "bullish" : "bearish";
  return { macd: m, signal: s, hist, status };
}

export const MACD_STATUS_LABELS: Record<MacdStatus, string> = {
  bullish: "Pozitif",
  bearish: "Negatif",
  neutral: "Nötr",
};

export interface Bollinger {
  upper: number | null;
  mid: number | null;
  lower: number | null;
  pctB: number | null;
}

export function bollinger(closes: Series, period = 20, mult = 2): Bollinger {
  if (closes.length < period) return { upper: null, mid: null, lower: null, pctB: null };
  const slice = closes.slice(closes.length - period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const last = closes[closes.length - 1];
  const pctB = upper === lower ? 50 : ((last - lower) / (upper - lower)) * 100;
  return { upper, mid, lower, pctB };
}

/** Annualised volatility (%) from daily returns expressed in percent. */
export function volatility(returnsPct: Series): number | null {
  const r = returnsPct.filter((x) => Number.isFinite(x));
  if (r.length < 5) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Close-based ATR approximation (fallback when no intraday high/low). */
export function atr(closes: Series, period = 14): number | null {
  if (closes.length < period + 1) return null;
  const tr: Series = [];
  for (let i = 1; i < closes.length; i++) tr.push(Math.abs(closes[i] - closes[i - 1]));
  return sma(tr, period);
}

/**
 * True ATR (Wilder) from real intraday high/low/close.
 * TR = max(high-low, |high-prevClose|, |low-prevClose|).
 * Returns null when high/low data is incomplete — callers fall back to atr().
 */
export function atrTrue(
  highs: Series,
  lows: Series,
  closes: Series,
  period = 14,
): number | null {
  const n = Math.min(highs.length, lows.length, closes.length);
  if (n < period + 1) return null;
  const tr: Series = [];
  for (let i = 1; i < n; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(pc)) return null;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (tr.length < period) return null;
  // Wilder smoothing.
  let atrVal = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    atrVal = (atrVal * (period - 1) + tr[i]) / period;
  }
  return atrVal;
}

/** Beta of stock vs market daily returns (aligned, in percent). */
export function beta(stockRet: Series, marketRet: Series): number | null {
  const n = Math.min(stockRet.length, marketRet.length);
  if (n < 10) return null;
  const s = stockRet.slice(stockRet.length - n);
  const m = marketRet.slice(marketRet.length - n);
  const sm = s.reduce((a, b) => a + b, 0) / n;
  const mm = m.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (s[i] - sm) * (m[i] - mm);
    varM += (m[i] - mm) ** 2;
  }
  if (varM === 0) return null;
  return cov / varM;
}

export interface Levels {
  support: number[];
  resistance: number[];
}

/** Support/resistance from recent swing lows/highs of close prices. */
export function supportResistance(closes: Series, current: number): Levels {
  if (closes.length < 10) return { support: [], resistance: [] };
  const win = closes.slice(Math.max(0, closes.length - 60));
  const sorted = [...new Set(win.map((c) => Number(c.toFixed(2))))];
  const support = sorted
    .filter((c) => c < current)
    .sort((a, b) => b - a)
    .slice(0, 2);
  const resistance = sorted
    .filter((c) => c > current)
    .sort((a, b) => a - b)
    .slice(0, 2);
  // recent absolute extremes as fallback anchors
  const lo = Math.min(...win);
  const hi = Math.max(...win);
  if (!support.includes(lo) && lo < current) support.push(lo);
  if (!resistance.includes(hi) && hi > current) resistance.push(hi);
  return {
    support: support.sort((a, b) => b - a).slice(0, 3),
    resistance: resistance.sort((a, b) => a - b).slice(0, 3),
  };
}

// ===== AI score (0-100) + color tiers =====

export interface ScoreInputs {
  probability: number | null; // watchlist probability %
  matched_patterns: number | null;
  confidence: number | null; // %
  hist_success_pct: number | null; // %
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Composite 0-100 AI score from the frozen v1.0 watchlist outputs.
 * Weights: probability 45%, matched patterns 30%, confidence 15%, history 10%.
 */
export function aiScore(r: ScoreInputs): number {
  const prob = clamp01(((r.probability ?? 0) - 17) / 19); // base ~17.8 → max ~35
  const matched = clamp01((r.matched_patterns ?? 0) / 100);
  const conf = clamp01((r.confidence ?? 0) / 33.3);
  const hist = clamp01(((r.hist_success_pct ?? 0) - 17) / 14);
  const score = 100 * (0.45 * prob + 0.3 * matched + 0.15 * conf + 0.1 * hist);
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ===== Volume-confirmation, relative strength & liquidity =====
// These enrich the raw momentum signal with "is the crowd actually behind this
// move?" (OBV), "is it leading the market?" (relative strength) and "can you
// realistically trade it?" (liquidity) — the three most common blind spots of
// a pure price/return model.

export type ObvTrend = "rising" | "falling" | "flat";

/** On-Balance Volume series from aligned close + volume history. */
export function obvSeries(closes: Series, volumes: Series): Series {
  const n = Math.min(closes.length, volumes.length);
  if (n < 2) return [];
  const out: Series = [0];
  for (let i = 1; i < n; i++) {
    const v = volumes[i] || 0;
    if (closes[i] > closes[i - 1]) out.push(out[i - 1] + v);
    else if (closes[i] < closes[i - 1]) out.push(out[i - 1] - v);
    else out.push(out[i - 1]);
  }
  return out;
}

/**
 * OBV trend over the last `lookback` sessions. "rising" means volume is
 * accumulating on up days (the move is confirmed by real buying), "falling"
 * means the advance is running on thin/declining volume (a warning).
 */
export function obvTrend(closes: Series, volumes: Series, lookback = 10): ObvTrend {
  const s = obvSeries(closes, volumes);
  if (s.length < lookback + 1) return "flat";
  const last = s[s.length - 1];
  const prev = s[s.length - 1 - lookback];
  const scale = Math.max(1, Math.abs(prev) || Math.max(...volumes.slice(-lookback), 1));
  const change = (last - prev) / scale;
  if (change > 0.08) return "rising";
  if (change < -0.08) return "falling";
  return "flat";
}

/**
 * Relative strength vs the market over the last `n` sessions: how much the
 * stock out- (or under-) performed the average BIST return, in points.
 * Positive = leadership, negative = laggard.
 */
export function relativeStrength(
  stockRets: Series,
  marketRets: Series,
  n: number,
): number | null {
  if (!stockRets.length || !marketRets.length) return null;
  const s = stockRets.slice(-n).reduce((a, b) => a + b, 0);
  const m = marketRets.slice(-n).reduce((a, b) => a + b, 0);
  return s - m;
}

export type LiquidityLevel = "high" | "medium" | "low" | "thin";

export interface LiquidityStyle {
  level: LiquidityLevel;
  label: string;
  text: string;
  bg: string;
  border: string;
}

/**
 * Liquidity tier from the daily traded value (TL). Thin names are easy to
 * manipulate and hard to exit, so the ranking should discount them.
 * Thresholds are anchored to the current BIST distribution
 * (~p25 ≈ 20M, median ≈ 65M, p90 ≈ 700M TL).
 */
export function liquidityTier(dailyTradedValue: number | null): LiquidityStyle {
  const v = dailyTradedValue ?? 0;
  if (v >= 250_000_000)
    return { level: "high", label: "Yüksek", text: "text-success", bg: "bg-success/10", border: "border-success/40" };
  if (v >= 50_000_000)
    return { level: "medium", label: "Orta", text: "text-primary", bg: "bg-primary/10", border: "border-primary/40" };
  if (v >= 15_000_000)
    return { level: "low", label: "Düşük", text: "text-warning", bg: "bg-warning/10", border: "border-warning/40" };
  return { level: "thin", label: "Sığ", text: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/40" };
}

// ===== Stability layer =====
// The frozen v1.0 engine is a momentum model: it tends to flag stocks *after*
// a sharp multi-day run-up, exactly when the move is most exhausted and prone
// to a pullback. This layer scores how *durable* a setup is (0-100) so we can
// down-rank overbought / overextended names and surface steadier candidates.

export interface StabilityInputs {
  rsi: number | null;
  ret5d: number | null; // accumulated % over last ~5 sessions
  ret20d: number | null; // accumulated % over last ~20 sessions
  macdStatus: MacdStatus;
  volatility: number | null; // annualised %
  dailyReturn: number | null; // last session %
  // Enrichment signals (optional so existing callers keep working).
  relStrength20d?: number | null; // outperformance vs market over ~20 sessions
  obv?: ObvTrend; // volume confirmation of the move
  liquidity?: LiquidityLevel; // tradeability
}

/**
 * 0-100 stability score. 100 = calm, confirmed trend; low = overextended,
 * overbought, or already exhausted (the setups that most often fade).
 */
export function stabilityScore(i: StabilityInputs): number {
  let s = 100;

  // Overbought / oversold (RSI).
  if (i.rsi !== null) {
    if (i.rsi >= 82) s -= 45;
    else if (i.rsi >= 74) s -= 30;
    else if (i.rsi >= 68) s -= 16;
    else if (i.rsi < 28) s -= 22; // falling knife
  }

  // Short-term exhaustion: already ran a lot in 5 sessions.
  if (i.ret5d !== null) {
    if (i.ret5d >= 40) s -= 42;
    else if (i.ret5d >= 25) s -= 26;
    else if (i.ret5d >= 15) s -= 13;
    if (i.ret5d <= -12) s -= 16; // sharp recent drop = active downtrend
  }

  // Medium-term overextension.
  if (i.ret20d !== null) {
    if (i.ret20d >= 55) s -= 18;
    else if (i.ret20d >= 35) s -= 9;
  }

  // Trend confirmation.
  if (i.macdStatus === "bearish") s -= 20;
  else if (i.macdStatus === "bullish") s += 4;

  // Volatility (choppier = less reliable).
  if (i.volatility !== null) {
    if (i.volatility > 130) s -= 16;
    else if (i.volatility > 85) s -= 8;
  }

  // A hard down day right before the recommendation is a red flag.
  if (i.dailyReturn !== null && i.dailyReturn < -3) s -= 10;

  // Relative strength vs the market: leaders are more durable than names that
  // only rose because the whole market did, or that lag it while "running".
  if (i.relStrength20d !== null && i.relStrength20d !== undefined) {
    if (i.relStrength20d >= 10) s += 8;
    else if (i.relStrength20d >= 3) s += 4;
    else if (i.relStrength20d <= -15) s -= 14;
    else if (i.relStrength20d <= -5) s -= 7;
  }

  // Volume confirmation (OBV): a rally on rising volume is real accumulation;
  // a rally on falling volume is a distribution/exhaustion warning.
  if (i.obv === "rising") s += 6;
  else if (i.obv === "falling") s -= 12;

  // Liquidity: thin names are manipulable and hard to exit.
  if (i.liquidity === "thin") s -= 18;
  else if (i.liquidity === "low") s -= 8;

  return Math.round(Math.max(0, Math.min(100, s)));
}

/**
 * Blended ranking score: keeps the AI signal but discounts fragile setups.
 * 60% AI signal, 40% stability. This is the default sort for the lists.
 */
export function blendedScore(ai: number, stability: number): number {
  return Math.round(0.6 * ai + 0.4 * stability);
}

export type StabilityLevel = "durable" | "steady" | "fragile" | "overextended";

export interface StabilityStyle {
  level: StabilityLevel;
  label: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
}

export function stabilityTier(s: number): StabilityStyle {
  if (s >= 70)
    return {
      level: "durable",
      label: "Sağlam",
      text: "text-success",
      bg: "bg-success/10",
      border: "border-success/40",
      dot: "bg-success",
    };
  if (s >= 50)
    return {
      level: "steady",
      label: "Dengeli",
      text: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/40",
      dot: "bg-primary",
    };
  if (s >= 32)
    return {
      level: "fragile",
      label: "Kırılgan",
      text: "text-warning",
      bg: "bg-warning/10",
      border: "border-warning/40",
      dot: "bg-warning",
    };
  return {
    level: "overextended",
    label: "Aşırı uzamış",
    text: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/40",
    dot: "bg-destructive",
  };
}

export type ScoreTier = "strong" | "watch" | "neutral" | "weak";

export interface TierStyle {
  tier: ScoreTier;
  label: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
  bar: string;
}

export function scoreTier(score: number): TierStyle {
  if (score >= 70)
    return {
      tier: "strong",
      label: "Çok güçlü",
      text: "text-success",
      bg: "bg-success/10",
      border: "border-success/40",
      dot: "bg-success",
      bar: "bg-success",
    };
  if (score >= 50)
    return {
      tier: "watch",
      label: "İzlenmeli",
      text: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/40",
      dot: "bg-primary",
      bar: "bg-primary",
    };
  if (score >= 30)
    return {
      tier: "neutral",
      label: "Nötr",
      text: "text-muted-foreground",
      bg: "bg-muted/40",
      border: "border-border",
      dot: "bg-muted-foreground",
      bar: "bg-muted-foreground",
    };
  return {
    tier: "weak",
    label: "Zayıf",
    text: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/40",
    dot: "bg-destructive",
    bar: "bg-destructive",
  };
}

// BIST'te tek seans fiyat limiti ±%10'dur; +%15 ve +%20 hedefleri tek günde
// değil, birkaç işlem günü içinde birikimli olarak ölçülür.
export const TARGET_LABELS: Record<string, string> = {
  g20: "20 günde +%20 (birikimli)",
  g15: "10 günde +%15 (birikimli)",
  g10: "5 günde +%10 (birikimli)",
  lu: "Tavan (tek seans +%10)",
};

export function targetLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return TARGET_LABELS[t] ?? t;
}

// ===== Qualitative expectation (no price target / no certainty) =====
// Deliberately avoids deterministic claims like "Tavan" or "+%20".
// Reflects the model's confidence level, not a guaranteed move.

export interface Expectation {
  label: string;
  /** Tailwind text color class */
  text: string;
  /** Short qualitative risk reading */
  risk: string;
}

/**
 * Maps the composite AI score (0-100) to a qualitative expectation phrase.
 * This is a statistical confidence reading — not investment advice and not a
 * price prediction.
 */
export function expectation(score: number): Expectation {
  if (score >= 78) return { label: "Çok güçlü momentum", text: "text-success", risk: "Yüksek" };
  if (score >= 62) return { label: "Güçlü alım sinyali", text: "text-success", risk: "Yüksek" };
  if (score >= 46) return { label: "Pozitif beklenti", text: "text-primary", risk: "Orta" };
  if (score >= 32) return { label: "İzlenmeli", text: "text-primary", risk: "Orta" };
  if (score >= 18) return { label: "Nötr", text: "text-muted-foreground", risk: "Düşük" };
  return { label: "Zayıf", text: "text-muted-foreground", risk: "Düşük" };
}

/** "%72 olasılıkla pozitif" style helper, or null when no probability. */
export function probabilityNote(probability: number | null | undefined): string | null {
  if (probability === null || probability === undefined || Number.isNaN(probability)) return null;
  return `%${probability.toFixed(0)} olasılıkla pozitif`;
}
