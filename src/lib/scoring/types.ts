// New Scoring Engine — shared contracts.
//
// This engine runs *in parallel* with the frozen SQL "v1.0" AI motoru. It never
// mutates the database or the legacy `aiScore`; it only produces an alternative,
// fully client-side, modular score for comparison (developer mode) and future
// backtesting. Every module is pure and dependency-free so it is trivially
// unit-testable.

import type { MacdStatus, ObvTrend, LiquidityLevel } from "@/lib/indicators";

/** Uniform output shape returned by every scoring module. */
export interface ScoreComponent {
  /** 0-100 sub-score for this dimension. */
  score: number;
  /** 0-1 data sufficiency (fraction of expected inputs that were available). */
  confidence: number;
  /** Relative weight of this module inside the final blend (0-1). */
  weight: number;
  /** Human-readable Turkish explanations of what drove the score. */
  reasons: string[];
}

/**
 * All raw + precomputed inputs a scoring module may read. Kept flat and
 * primitive so tests can construct a context literal without any DB access.
 */
export interface ScoreContext {
  symbol: string;

  // --- Price / momentum indicators (nullable when history is too short) ---
  lastClose: number | null;
  rsi: number | null;
  macdStatus: MacdStatus;
  macdHist: number | null;
  ema20: number | null;
  ema50: number | null;
  sma20: number | null;
  bollingerPctB: number | null;
  ret5d: number | null;
  ret20d: number | null;
  dailyReturn: number | null;
  relStrength20d: number | null;

  // --- Volume / liquidity ---
  obv: ObvTrend;
  volumeIncrease: number | null; // % vs 20d average
  liquidityValue: number | null; // daily traded value (TL)
  liquidityLevel: LiquidityLevel;

  // --- Risk ---
  volatility: number | null; // annualised %

  // --- Fundamental (stub inputs, wired for later) ---
  marketCap: number | null;
  sector: string | null;

  // --- News (stub inputs, wired for later) ---
  kapCount: number | null;

  // --- Legacy engine output, for side-by-side comparison ---
  legacyAiScore: number;
}

export interface ScoreEngine {
  readonly id: string;
  readonly label: string;
  score(ctx: ScoreContext): ScoreComponent;
}

/** Final blended result across all registered modules. */
export interface FinalScore {
  /** 0-100 confidence-weighted blend of the module scores. */
  total: number;
  /** 0-100 legacy AI score for reference. */
  legacyScore: number;
  /** total - legacyScore (positive = new engine is more bullish). */
  delta: number;
  /** 0-1 aggregate confidence (how much of the intended weight had data). */
  confidence: number;
  /** Per-module breakdown keyed by engine id. */
  components: Record<string, ScoreComponent>;
  /** Flattened top reasons across modules. */
  reasons: string[];
}

/** Clamp helper shared by modules. */
export function clampScore(x: number): number {
  return Math.round(Math.max(0, Math.min(100, x)));
}
