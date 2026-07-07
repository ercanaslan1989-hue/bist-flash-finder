// Backtest strategies — each maps a look-ahead-free ScoreContext to a 0-100
// score (or null when it does not apply). All strategies are pure and reuse
// the exact same scoring modules the live app uses, so a backtest measures the
// real engines, not a re-implementation.

import {
  TechnicalScoreEngine,
  VolumeScoreEngine,
  RiskScoreEngine,
  computeFinalScore,
  type ScoreContext,
} from "@/lib/scoring";
import type { Strategy, StrategyExtra } from "./types";

const tech = (ctx: ScoreContext) => TechnicalScoreEngine.score(ctx).score;
const vol = (ctx: ScoreContext) => VolumeScoreEngine.score(ctx).score;
const risk = (ctx: ScoreContext) => RiskScoreEngine.score(ctx).score;

/** Legacy v1.0 AI engine — signals are the historical watchlist picks. */
export const OldAiStrategy: Strategy = {
  id: "old_ai",
  label: "Eski AI (v1.0)",
  description: "Donmuş SQL kalıp motorunun o günkü watchlist seçimleri.",
  evaluate: (_ctx, extra: StrategyExtra) => extra.legacyScore,
};

/** New modular engine — full confidence-weighted blend. */
export const FinalScoreStrategy: Strategy = {
  id: "final_score",
  label: "Yeni Final Score",
  description: "Teknik + Hacim + Risk modüllerinin güven ağırlıklı harmanı.",
  evaluate: (ctx) => computeFinalScore(ctx).total,
};

/** Technical module only. */
export const TechnicalOnlyStrategy: Strategy = {
  id: "technical_only",
  label: "Sadece Teknik",
  description: "RSI / MACD / EMA / Bollinger tabanlı teknik skor.",
  evaluate: (ctx) => tech(ctx),
};

/** Technical + Volume blend. */
export const TechVolumeStrategy: Strategy = {
  id: "tech_volume",
  label: "Teknik + Hacim",
  description: "Teknik skorun hacim teyidiyle harmanı (%60/%40).",
  evaluate: (ctx) => Math.round(0.6 * tech(ctx) + 0.4 * vol(ctx)),
};

/** Technical + Risk blend. */
export const TechRiskStrategy: Strategy = {
  id: "tech_risk",
  label: "Teknik + Risk",
  description: "Teknik skorun risk (dayanıklılık) skoruyla harmanı (%60/%40).",
  evaluate: (ctx) => Math.round(0.6 * tech(ctx) + 0.4 * risk(ctx)),
};

/** Default strategy set compared in every backtest run. */
export const DEFAULT_STRATEGIES: Strategy[] = [
  OldAiStrategy,
  FinalScoreStrategy,
  TechnicalOnlyStrategy,
  TechVolumeStrategy,
  TechRiskStrategy,
];
