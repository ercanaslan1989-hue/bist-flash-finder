// New Scoring Engine — public surface + a ready-to-use default instance that
// registers every module (real + stubs) in weight order. Consumers import
// `computeFinalScore` (or `defaultScoringEngine`) so the wiring stays in one
// place. This runs entirely in parallel with the legacy SQL engine.

import { FinalScoreEngine } from "./final-engine";
import { TechnicalScoreEngine } from "./technical-engine";
import { VolumeScoreEngine } from "./volume-engine";
import { RiskScoreEngine } from "./risk-engine";
import { FundamentalScoreEngine } from "./fundamental-engine";
import { NewsScoreEngine } from "./news-engine";
import type { FinalScore, ScoreContext } from "./types";

export * from "./types";
export { FinalScoreEngine } from "./final-engine";
export { TechnicalScoreEngine, TECHNICAL_WEIGHT } from "./technical-engine";
export { VolumeScoreEngine, VOLUME_WEIGHT } from "./volume-engine";
export { RiskScoreEngine, RISK_WEIGHT } from "./risk-engine";
export { FundamentalScoreEngine, FUNDAMENTAL_WEIGHT } from "./fundamental-engine";
export { NewsScoreEngine, NEWS_WEIGHT } from "./news-engine";

/** Default engine wiring used across the app (order = display order). */
export const defaultScoringEngine = new FinalScoreEngine([
  TechnicalScoreEngine,
  VolumeScoreEngine,
  RiskScoreEngine,
  FundamentalScoreEngine,
  NewsScoreEngine,
]);

/** Convenience wrapper around the default engine. */
export function computeFinalScore(ctx: ScoreContext): FinalScore {
  return defaultScoringEngine.compute(ctx);
}
