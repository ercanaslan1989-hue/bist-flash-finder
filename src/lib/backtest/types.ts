// Backtest Engine — shared contracts (FAZ 2B).
//
// This engine runs entirely in parallel with the frozen SQL "v1.0" AI motoru
// and the live scoring engine. It NEVER mutates existing data or APIs; it only
// replays history to measure how well each scoring strategy would have done.
//
// Look-ahead bias is prevented by construction: every score is computed from a
// `ScoreContext` built strictly from data at/or before the signal day, and
// forward returns are read only from days *after* the signal.

import type { ScoreContext } from "@/lib/scoring";

/** Horizons (in trading days) each signal is evaluated over. */
export const HORIZONS = [1, 3, 5, 10, 20] as const;
export type Horizon = (typeof HORIZONS)[number];

/** Extra per-signal inputs a strategy may read besides the ScoreContext. */
export interface StrategyExtra {
  /** Legacy v1.0 AI score for this symbol/day (from historical watchlist), or null. */
  legacyScore: number | null;
}

/**
 * A scoring strategy. Pure and deterministic: given the same context it must
 * always return the same score. Returns `null` when the strategy does not
 * produce a candidate for this symbol/day (e.g. old AI had no watchlist entry).
 */
export interface Strategy {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  evaluate(ctx: ScoreContext, extra: StrategyExtra): number | null;
}

/** Forward-return outcome of a single signal (strategy-independent). */
export interface Forward {
  symbol: string;
  signalDate: string;
  entryClose: number;
  ret1d: number | null;
  ret3d: number | null;
  ret5d: number | null;
  ret10d: number | null;
  ret20d: number | null;
  /** Best cumulative gain reached within the 20-day window (%). */
  maxRet: number;
  /** Reached the profit target within the window. */
  hit: boolean;
  /** Trading days until the target was first reached, or null. */
  daysToHit: number | null;
}

/** A recorded buy signal for one strategy. */
export interface Prediction extends Forward {
  strategyId: string;
  score: number;
}

/** Performance metrics for one strategy at one evaluation horizon. */
export interface PerformanceMetrics {
  horizon: Horizon;
  signals: number;
  /** % of settled signals with a positive return at the horizon. */
  hitRate: number | null;
  avgReturn: number | null;
  medianReturn: number | null;
  profitFactor: number | null;
  /** Worst peak-to-trough drawdown of the cumulative equity curve (%, <= 0). */
  maxDrawdown: number | null;
  sharpe: number | null;
  /** Average holding time (days to target, else full horizon). */
  avgHolding: number | null;
  bestStreak: number;
  worstStreak: number;
}

/** Full result for one strategy across all horizons. */
export interface StrategyResult {
  strategyId: string;
  strategyLabel: string;
  predictions: Prediction[];
  metrics: Record<Horizon, PerformanceMetrics>;
}

/** Parameters controlling a backtest run. */
export interface BacktestParams {
  /** Inclusive ISO start date for signal generation. */
  startDate: string;
  /** Inclusive ISO end date for signal generation. */
  endDate: string;
  /** Minimum score (0-100) required to emit a signal. */
  minScore: number;
  /** Profit target (%) used for hit-rate / days-to-hit within 20 days. */
  target: number;
  /** Minimum sessions of history before a symbol becomes eligible. */
  warmup: number;
}

export const DEFAULT_PARAMS: BacktestParams = {
  startDate: "",
  endDate: "",
  minScore: 60,
  target: 10,
  warmup: 50,
};

/** Progress callback payload. */
export interface BacktestProgress {
  processed: number;
  total: number;
  percent: number;
  currentSymbol: string | null;
  signals: number;
}

/** Aggregate result of a full multi-strategy backtest. */
export interface BacktestResult {
  params: BacktestParams;
  universeSize: number;
  startDate: string | null;
  endDate: string | null;
  totalSignals: number;
  strategies: StrategyResult[];
  /** Primary evaluation horizon used for headline numbers. */
  primaryHorizon: Horizon;
}

export class BacktestAbortError extends Error {
  constructor() {
    super("Backtest durduruldu");
    this.name = "BacktestAbortError";
  }
}
