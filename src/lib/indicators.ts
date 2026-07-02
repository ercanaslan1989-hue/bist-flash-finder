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

/** Close-based ATR approximation (no intraday high/low available). */
export function atr(closes: Series, period = 14): number | null {
  if (closes.length < period + 1) return null;
  const tr: Series = [];
  for (let i = 1; i < closes.length; i++) tr.push(Math.abs(closes[i] - closes[i - 1]));
  return sma(tr, period);
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
