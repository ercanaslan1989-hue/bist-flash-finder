// PerformanceAnalyzer — pure metric computation over a strategy's predictions.
// Deterministic and dependency-free so metrics are trivially unit-tested.

import { HORIZONS, type Horizon, type PerformanceMetrics, type Prediction } from "./types";

function returnAt(p: Prediction, h: Horizon): number | null {
  switch (h) {
    case 1:
      return p.ret1d;
    case 3:
      return p.ret3d;
    case 5:
      return p.ret5d;
    case 10:
      return p.ret10d;
    case 20:
      return p.ret20d;
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mu = mean(xs)!;
  const v = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Longest run of returns matching `positive`, in date order. */
function longestStreak(returns: number[], positive: boolean): number {
  let best = 0;
  let cur = 0;
  for (const r of returns) {
    const match = positive ? r > 0 : r <= 0;
    if (match) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

/**
 * Max peak-to-trough drawdown (%, <= 0) of the cumulative additive equity
 * curve, treating each settled return as a sequential trade in date order.
 */
function maxDrawdown(returnsInDateOrder: number[]): number | null {
  if (returnsInDateOrder.length === 0) return null;
  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  for (const r of returnsInDateOrder) {
    cum += r;
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}

/** Compute metrics for one strategy at one horizon. */
export function analyzeHorizon(predictions: Prediction[], horizon: Horizon): PerformanceMetrics {
  // Settled = has a realised return at this horizon; keep chronological order.
  const settled = [...predictions]
    .filter((p) => returnAt(p, horizon) != null)
    .sort((a, b) => a.signalDate.localeCompare(b.signalDate));
  const returns = settled.map((p) => returnAt(p, horizon)!);

  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  const sd = stddev(returns);
  const mu = mean(returns);
  // Annualise the per-trade Sharpe by the number of horizons per trading year.
  const sharpe = sd && sd > 0 && mu != null ? (mu / sd) * Math.sqrt(252 / horizon) : null;

  const holdings = settled.map((p) => (p.hit && p.daysToHit != null ? p.daysToHit : horizon));

  return {
    horizon,
    signals: settled.length,
    hitRate: returns.length ? (wins.length / returns.length) * 100 : null,
    avgReturn: mu,
    medianReturn: median(returns),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    maxDrawdown: maxDrawdown(returns),
    sharpe,
    avgHolding: mean(holdings),
    bestStreak: longestStreak(returns, true),
    worstStreak: longestStreak(returns, false),
  };
}

/** Compute metrics across every horizon. */
export function analyzeAll(predictions: Prediction[]): Record<Horizon, PerformanceMetrics> {
  const out = {} as Record<Horizon, PerformanceMetrics>;
  for (const h of HORIZONS) out[h] = analyzeHorizon(predictions, h);
  return out;
}
