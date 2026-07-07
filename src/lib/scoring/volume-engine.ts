// VolumeScoreEngine — is real money behind the move? Reads OBV trend, volume
// expansion vs the 20-day average, and tradability (liquidity tier).

import { clampScore, type ScoreComponent, type ScoreContext, type ScoreEngine } from "./types";

export const VOLUME_WEIGHT = 0.25;

export const VolumeScoreEngine: ScoreEngine = {
  id: "volume",
  label: "Hacim",
  score(ctx: ScoreContext): ScoreComponent {
    let s = 50;
    const reasons: string[] = [];
    const expected = 3;
    let available = 0;

    // OBV: volume confirmation of the move.
    available++;
    if (ctx.obv === "rising") {
      s += 18;
      reasons.push("OBV yükseliyor (hareket gerçek alımla teyitli)");
    } else if (ctx.obv === "falling") {
      s -= 18;
      reasons.push("OBV düşüyor (yükseliş zayıf hacimle — uyarı)");
    } else {
      reasons.push("OBV yatay (belirgin hacim teyidi yok)");
    }

    // Volume expansion vs 20-day average.
    if (ctx.volumeIncrease !== null) {
      available++;
      const v = ctx.volumeIncrease;
      if (v >= 100) {
        s += 18;
        reasons.push(`Hacim 20g ortalamanın %${v.toFixed(0)} üzerinde (güçlü teyit)`);
      } else if (v >= 30) {
        s += 10;
        reasons.push(`Hacim artışı %${v.toFixed(0)} (ılımlı teyit)`);
      } else if (v <= -50) {
        s -= 12;
        reasons.push(`Hacim %${v.toFixed(0)} kurudu`);
      }
    }

    // Liquidity / tradability.
    if (ctx.liquidityValue !== null) {
      available++;
      switch (ctx.liquidityLevel) {
        case "high":
          s += 8;
          reasons.push("Yüksek likidite (kolay giriş/çıkış)");
          break;
        case "medium":
          s += 2;
          reasons.push("Orta likidite");
          break;
        case "low":
          s -= 8;
          reasons.push("Düşük likidite");
          break;
        case "thin":
          s -= 18;
          reasons.push("Sığ likidite (manipülasyona açık, çıkışı zor)");
          break;
      }
    }

    return {
      score: clampScore(s),
      confidence: available / expected,
      weight: VOLUME_WEIGHT,
      reasons,
    };
  },
};
