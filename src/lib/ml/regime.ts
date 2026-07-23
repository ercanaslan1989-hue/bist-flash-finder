// Regime detector — classifies BIST market state as trend / sideways / risk-off
// using recent breadth (average daily return) and cross-sectional volatility.
// Deterministic, look-ahead-free (uses only past daily_snapshots).

import { supabase } from "@/integrations/supabase/client";

export type Regime = "trend_up" | "trend_down" | "sideways" | "risk_off";

export interface RegimeSnapshot {
  regime: Regime;
  regimeScore: number; // -1 (bearish) .. +1 (bullish)
  trend: number; // avg daily return %, 20d
  volatility: number; // cross-sectional stddev of daily returns %
  breadth: number; // share of stocks with positive daily return (0..1)
  sampleDays: number;
  sampleSymbols: number;
  asOf: string;
}

const sb = supabase as unknown as { from: (t: string) => any };

export async function detectRegime(windowDays = 20): Promise<RegimeSnapshot> {
  // Pull recent daily snapshot rows. Use ret_20d as trend proxy, daily_return_pct
  // to measure breadth/volatility. Limit to top-liquid subset to avoid noise.
  const since = new Date();
  since.setDate(since.getDate() - windowDays - 2);
  const { data, error } = await sb
    .from("daily_snapshots")
    .select("snapshot_date, symbol, daily_return_pct, ret_20d, market_value")
    .gte("snapshot_date", since.toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: false })
    .limit(20000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    snapshot_date: string;
    symbol: string;
    daily_return_pct: number | null;
    ret_20d: number | null;
    market_value: number | null;
  }>;

  if (!rows.length) {
    return emptySnapshot(windowDays);
  }

  const dates = new Set(rows.map((r) => r.snapshot_date));
  const latest = [...dates].sort().pop()!;
  const latestRows = rows.filter((r) => r.snapshot_date === latest);

  const dailyReturns = latestRows
    .map((r) => r.daily_return_pct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const trendReturns = latestRows
    .map((r) => r.ret_20d)
    .filter((v): v is number => v != null && Number.isFinite(v));

  const trend = mean(trendReturns);
  const volatility = stddev(dailyReturns);
  const breadth = dailyReturns.length
    ? dailyReturns.filter((r) => r > 0).length / dailyReturns.length
    : 0.5;

  // Regime score: trend direction weighted by breadth, penalized by extreme vol.
  const trendNorm = clamp(trend / 15, -1, 1); // ±15% over 20d saturates
  const breadthNorm = (breadth - 0.5) * 2; // -1..+1
  const volPenalty = clamp(volatility / 6, 0, 1); // ≥6% cross-sectional stddev = high stress
  const regimeScore = clamp(0.6 * trendNorm + 0.4 * breadthNorm - 0.3 * volPenalty, -1, 1);

  let regime: Regime;
  if (volPenalty > 0.7 && regimeScore < 0) regime = "risk_off";
  else if (regimeScore > 0.25) regime = "trend_up";
  else if (regimeScore < -0.25) regime = "trend_down";
  else regime = "sideways";

  return {
    regime,
    regimeScore: round(regimeScore, 3),
    trend: round(trend, 2),
    volatility: round(volatility, 2),
    breadth: round(breadth, 3),
    sampleDays: dates.size,
    sampleSymbols: latestRows.length,
    asOf: latest,
  };
}

export const REGIME_LABEL: Record<Regime, string> = {
  trend_up: "Yükseliş trendi",
  trend_down: "Düşüş trendi",
  sideways: "Yatay piyasa",
  risk_off: "Risk-off (stres)",
};

export const REGIME_ADVICE: Record<Regime, string> = {
  trend_up:
    "Champion (Kural Motoru) ağırlığı yüksek tutulur; momentum sinyallerine güvenilir.",
  trend_down:
    "Karar eşiği yükseltilir, yalnız yüksek güvenli setup'lar önerilir.",
  sideways:
    "Challenger (ML) ağırlığı artırılır; mean-reversion setup'larına öncelik verilir.",
  risk_off:
    "Yeni sinyaller filtrelenir, mevcut watchlist konservatif ölçekle sunulur.",
};

function emptySnapshot(windowDays: number): RegimeSnapshot {
  return {
    regime: "sideways",
    regimeScore: 0,
    trend: 0,
    volatility: 0,
    breadth: 0.5,
    sampleDays: 0,
    sampleSymbols: 0,
    asOf: new Date().toISOString().slice(0, 10),
  };
  void windowDays;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mu = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1));
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function round(x: number, d: number): number {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}
