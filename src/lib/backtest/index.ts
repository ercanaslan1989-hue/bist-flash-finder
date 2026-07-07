// Backtest Engine — public surface (FAZ 2B).
//
// Fully independent, look-ahead-free historical simulation that runs in
// parallel with the frozen SQL AI motoru and the live scoring engine. Nothing
// here mutates existing data or APIs. Designed to be extended by the upcoming
// ML module (XGBoost/LightGBM): a new `Strategy` can wrap a model's score and
// drop straight into `BacktestEngine` with zero changes elsewhere.

export * from "./types";
export { BacktestEngine, PRIMARY_HORIZON } from "./backtest-engine";
export type { RunOptions } from "./backtest-engine";
export { StrategyRunner, runStrategyOnSymbol } from "./strategy-runner";
export { analyzeAll, analyzeHorizon } from "./performance-analyzer";
export { buildContextAt, computeForward } from "./context";
export type { PreparedSymbol } from "./context";
export {
  DEFAULT_STRATEGIES,
  OldAiStrategy,
  FinalScoreStrategy,
  TechnicalOnlyStrategy,
  TechVolumeStrategy,
  TechRiskStrategy,
} from "./strategies";
export { generateReport, qualityScore } from "./report-generator";
export type { BacktestReport, StrategyRanking } from "./report-generator";
export {
  loadBacktestData,
  fetchLatestSnapshotDate,
  type LoadOptions,
} from "./data";
export {
  saveBacktestResult,
  fetchRuns,
  fetchRunMetrics,
  fetchRunPredictions,
  type StoredRun,
  type StoredMetric,
  type StoredPrediction,
} from "./result-store";

import { BacktestEngine } from "./backtest-engine";
import { DEFAULT_STRATEGIES } from "./strategies";

/** Ready-to-use engine wired with the default strategy set. */
export const defaultBacktestEngine = new BacktestEngine(DEFAULT_STRATEGIES);
