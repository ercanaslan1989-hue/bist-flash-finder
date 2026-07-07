// BacktestEngine — orchestrates all strategies over the prepared history in a
// single look-ahead-free pass, yielding to the event loop so the UI stays
// responsive, reporting progress, and honouring an abort signal.

import type { PreparedSymbol } from "./context";
import { computeForward } from "./context";
import { StrategyRunner } from "./strategy-runner";
import {
  BacktestAbortError,
  HORIZONS,
  type BacktestParams,
  type BacktestProgress,
  type BacktestResult,
  type Horizon,
  type Strategy,
} from "./types";

const PRIMARY_HORIZON: Horizon = 5;

export interface RunOptions {
  onProgress?: (p: BacktestProgress) => void;
  signal?: AbortSignal;
  /** How many symbols to process between event-loop yields. */
  chunkSize?: number;
}

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

export class BacktestEngine {
  private readonly strategies: Strategy[];

  constructor(strategies: Strategy[]) {
    this.strategies = strategies;
  }

  /**
   * Run the backtest over prepared symbol data. Pure with respect to the
   * inputs — the only side effects are the progress callback and yielding.
   */
  async run(
    universe: PreparedSymbol[],
    params: BacktestParams,
    options: RunOptions = {},
  ): Promise<BacktestResult> {
    const { onProgress, signal, chunkSize = 15 } = options;
    const runners = this.strategies.map((s) => new StrategyRunner(s, params));

    let processed = 0;
    let signals = 0;
    let minDate: string | null = null;
    let maxDate: string | null = null;
    const total = universe.length;

    for (const sym of universe) {
      if (signal?.aborted) throw new BacktestAbortError();

      for (let i = params.warmup; i < sym.closes.length; i++) {
        const date = sym.dates[i];
        if (date < params.startDate || date > params.endDate) continue;

        const forward = computeForward(sym, i, params.target);
        const before = runners.reduce((a, r) => a + r.predictions.length, 0);
        for (const runner of runners) runner.consider(sym, i, forward);
        const added = runners.reduce((a, r) => a + r.predictions.length, 0) - before;
        if (added > 0) {
          signals += added;
          if (!minDate || date < minDate) minDate = date;
          if (!maxDate || date > maxDate) maxDate = date;
        }
      }

      processed += 1;
      if (processed % chunkSize === 0 || processed === total) {
        onProgress?.({
          processed,
          total,
          percent: total ? Math.round((processed / total) * 100) : 100,
          currentSymbol: sym.symbol,
          signals,
        });
        await nextTick();
        if (signal?.aborted) throw new BacktestAbortError();
      }
    }

    return {
      params,
      universeSize: total,
      startDate: minDate,
      endDate: maxDate,
      totalSignals: signals,
      strategies: runners.map((r) => r.result()),
      primaryHorizon: PRIMARY_HORIZON,
    };
  }
}

export { HORIZONS, PRIMARY_HORIZON };
