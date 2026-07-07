// StrategyRunner — accumulates one strategy's predictions as the engine walks
// history. Stateless with respect to future data: it is only ever handed a
// context/forward pair for a single day and decides whether to record it.

import type { PreparedSymbol } from "./context";
import { buildContextAt, computeForward } from "./context";
import { analyzeAll } from "./performance-analyzer";
import type {
  BacktestParams,
  Forward,
  Prediction,
  Strategy,
  StrategyExtra,
  StrategyResult,
} from "./types";

export class StrategyRunner {
  readonly strategy: Strategy;
  private readonly minScore: number;
  readonly predictions: Prediction[] = [];

  constructor(strategy: Strategy, params: BacktestParams) {
    this.strategy = strategy;
    this.minScore = params.minScore;
  }

  /** Consider a single symbol/day. Records a prediction if the strategy fires. */
  consider(sym: PreparedSymbol, i: number, forward: Forward): void {
    const ctx = buildContextAt(sym, i);
    const extra: StrategyExtra = { legacyScore: sym.legacyByDate.get(sym.dates[i]) ?? null };
    const score = this.strategy.evaluate(ctx, extra);
    if (score == null || score < this.minScore) return;
    // Skip signals with no realised future at all (nothing to measure).
    if (forward.ret1d == null) return;
    this.predictions.push({ ...forward, strategyId: this.strategy.id, score });
  }

  result(): StrategyResult {
    return {
      strategyId: this.strategy.id,
      strategyLabel: this.strategy.label,
      predictions: this.predictions,
      metrics: analyzeAll(this.predictions),
    };
  }
}

/**
 * Convenience: run a single strategy over one prepared symbol synchronously.
 * (The async multi-strategy orchestrator lives in BacktestEngine.)
 */
export function runStrategyOnSymbol(
  strategy: Strategy,
  sym: PreparedSymbol,
  params: BacktestParams,
): Prediction[] {
  const runner = new StrategyRunner(strategy, params);
  for (let i = params.warmup; i < sym.closes.length; i++) {
    const date = sym.dates[i];
    if (date < params.startDate || date > params.endDate) continue;
    const forward = computeForward(sym, i, params.target);
    runner.consider(sym, i, forward);
  }
  return runner.predictions;
}
