// FundamentalScoreEngine — STUB (FAZ 2A). Wired into the pipeline but returns a
// neutral score with confidence 0, so it contributes nothing to the final blend
// yet. Real logic (market cap quality, sector strength, valuation) lands in a
// later phase.

import { type ScoreComponent, type ScoreContext, type ScoreEngine } from "./types";

export const FUNDAMENTAL_WEIGHT = 0.1;

export const FundamentalScoreEngine: ScoreEngine = {
  id: "fundamental",
  label: "Temel",
  score(_ctx: ScoreContext): ScoreComponent {
    return {
      score: 50,
      confidence: 0, // not implemented yet → excluded from the blend
      weight: FUNDAMENTAL_WEIGHT,
      reasons: ["Temel analiz modülü henüz aktif değil (stub)"],
    };
  },
};
