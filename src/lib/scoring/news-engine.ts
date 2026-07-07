// NewsScoreEngine — STUB (FAZ 2A). Wired but inert (confidence 0). Real logic
// (KAP disclosure momentum / sentiment) lands in a later phase.

import { type ScoreComponent, type ScoreContext, type ScoreEngine } from "./types";

export const NEWS_WEIGHT = 0.05;

export const NewsScoreEngine: ScoreEngine = {
  id: "news",
  label: "Haber/KAP",
  score(_ctx: ScoreContext): ScoreComponent {
    return {
      score: 50,
      confidence: 0, // not implemented yet → excluded from the blend
      weight: NEWS_WEIGHT,
      reasons: ["Haber/KAP modülü henüz aktif değil (stub)"],
    };
  },
};
