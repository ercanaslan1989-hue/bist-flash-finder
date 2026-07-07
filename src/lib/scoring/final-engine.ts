// FinalScoreEngine — orchestrates the modular engines and produces a single
// confidence-weighted blend, plus a side-by-side comparison against the legacy
// SQL AI score. Modules with confidence 0 (stubs) drop out automatically.

import type { FinalScore, ScoreContext, ScoreEngine } from "./types";

const MAX_REASONS = 6;

export class FinalScoreEngine {
  private engines: ScoreEngine[] = [];

  constructor(engines: ScoreEngine[] = []) {
    for (const e of engines) this.register(e);
  }

  register(engine: ScoreEngine): this {
    this.engines.push(engine);
    return this;
  }

  compute(ctx: ScoreContext): FinalScore {
    const components: FinalScore["components"] = {};
    let weightedScore = 0;
    let effectiveWeight = 0; // sum(weight * confidence)
    let intendedWeight = 0; // sum(weight)
    const reasons: string[] = [];

    for (const engine of this.engines) {
      const c = engine.score(ctx);
      components[engine.id] = c;
      intendedWeight += c.weight;
      const ew = c.weight * c.confidence;
      weightedScore += c.score * ew;
      effectiveWeight += ew;
      // Only surface reasons from modules that actually contributed.
      if (c.confidence > 0) reasons.push(...c.reasons);
    }

    // Fall back to the legacy score if no module had usable data.
    const total = effectiveWeight > 0 ? Math.round(weightedScore / effectiveWeight) : ctx.legacyAiScore;
    const confidence = intendedWeight > 0 ? effectiveWeight / intendedWeight : 0;

    return {
      total,
      legacyScore: ctx.legacyAiScore,
      delta: total - ctx.legacyAiScore,
      confidence: Math.round(confidence * 100) / 100,
      components,
      reasons: reasons.slice(0, MAX_REASONS),
    };
  }
}
