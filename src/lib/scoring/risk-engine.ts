// RiskScoreEngine — durability of the setup. Higher score = LOWER risk (calmer,
// less overextended, more tradable). Penalises high volatility, short-term
// exhaustion, hard down days and thin liquidity.

import { clampScore, type ScoreComponent, type ScoreContext, type ScoreEngine } from "./types";

export const RISK_WEIGHT = 0.2;

export const RiskScoreEngine: ScoreEngine = {
  id: "risk",
  label: "Risk",
  score(ctx: ScoreContext): ScoreComponent {
    let s = 100;
    const reasons: string[] = [];
    const expected = 4;
    let available = 0;

    // Volatility (annualised %).
    if (ctx.volatility !== null) {
      available++;
      const v = ctx.volatility;
      if (v > 130) {
        s -= 35;
        reasons.push(`Çok yüksek volatilite (%${v.toFixed(0)})`);
      } else if (v > 85) {
        s -= 18;
        reasons.push(`Yüksek volatilite (%${v.toFixed(0)})`);
      } else if (v > 60) {
        s -= 6;
        reasons.push(`Orta-yüksek volatilite (%${v.toFixed(0)})`);
      } else {
        reasons.push(`Volatilite kontrol altında (%${v.toFixed(0)})`);
      }
    }

    // Short-term exhaustion (5-day run-up) — big recent moves fade more often.
    if (ctx.ret5d !== null) {
      available++;
      const r = ctx.ret5d;
      if (r >= 40) {
        s -= 30;
        reasons.push(`5 günde %${r.toFixed(0)} yükseldi (aşırı uzama)`);
      } else if (r >= 25) {
        s -= 16;
        reasons.push(`5 günde %${r.toFixed(0)} yükseldi (uzamış)`);
      } else if (r >= 15) {
        s -= 6;
        reasons.push(`5 günlük hareket biraz uzamış (%${r.toFixed(0)})`);
      } else if (r <= -12) {
        s -= 14;
        reasons.push(`5 günde %${r.toFixed(0)} düştü (aktif düşüş)`);
      }
    }

    // Medium-term overextension (20-day).
    if (ctx.ret20d !== null) {
      available++;
      const r = ctx.ret20d;
      if (r >= 55) {
        s -= 14;
        reasons.push(`20 günde %${r.toFixed(0)} (orta vadede aşırı uzama)`);
      } else if (r >= 35) {
        s -= 6;
        reasons.push(`20 günlük getiri yüksek (%${r.toFixed(0)})`);
      }
    }

    // A hard down day right before the signal is a red flag.
    if (ctx.dailyReturn !== null) {
      available++;
      if (ctx.dailyReturn < -3) {
        s -= 8;
        reasons.push(`Son seans sert düşüş (%${ctx.dailyReturn.toFixed(1)})`);
      }
    }

    // Thin/low liquidity is an execution risk (does not consume a slot).
    if (ctx.liquidityLevel === "thin") {
      s -= 16;
      reasons.push("Sığ likidite ek risk oluşturuyor");
    } else if (ctx.liquidityLevel === "low") {
      s -= 6;
      reasons.push("Düşük likidite riski");
    }

    return {
      score: clampScore(s),
      confidence: available / expected,
      weight: RISK_WEIGHT,
      reasons,
    };
  },
};
