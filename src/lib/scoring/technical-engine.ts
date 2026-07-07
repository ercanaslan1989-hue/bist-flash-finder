// TechnicalScoreEngine — momentum / trend quality from RSI, MACD, EMA/SMA
// alignment and Bollinger position. Higher = healthier technical setup.

import { clampScore, type ScoreComponent, type ScoreContext, type ScoreEngine } from "./types";

export const TECHNICAL_WEIGHT = 0.4;

export const TechnicalScoreEngine: ScoreEngine = {
  id: "technical",
  label: "Teknik",
  score(ctx: ScoreContext): ScoreComponent {
    let s = 50;
    const reasons: string[] = [];
    const expected = 5;
    let available = 0;

    // RSI: reward a healthy momentum zone, punish overbought.
    if (ctx.rsi !== null) {
      available++;
      const r = ctx.rsi;
      if (r >= 45 && r <= 65) {
        s += 12;
        reasons.push(`RSI ${r.toFixed(0)} sağlıklı momentum bölgesinde`);
      } else if (r > 65 && r < 75) {
        s += 4;
        reasons.push(`RSI ${r.toFixed(0)} güçlü ama ısınıyor`);
      } else if (r >= 75) {
        s -= 18;
        reasons.push(`RSI ${r.toFixed(0)} aşırı alım (geri çekilme riski)`);
      } else if (r < 30) {
        s -= 6;
        reasons.push(`RSI ${r.toFixed(0)} aşırı satım — momentum zayıf`);
      } else {
        s -= 2;
        reasons.push(`RSI ${r.toFixed(0)} nötr/zayıf bölge`);
      }
    }

    // MACD: trend confirmation.
    if (ctx.macdHist !== null) {
      available++;
      if (ctx.macdStatus === "bullish") {
        s += 14;
        reasons.push("MACD pozitif (yukarı yönlü teyit)");
      } else if (ctx.macdStatus === "bearish") {
        s -= 16;
        reasons.push("MACD negatif (aşağı yönlü baskı)");
      } else {
        reasons.push("MACD nötr");
      }
    }

    // EMA alignment (20 vs 50).
    if (ctx.ema20 !== null && ctx.ema50 !== null) {
      available++;
      if (ctx.ema20 > ctx.ema50) {
        s += 10;
        reasons.push("EMA20 > EMA50 (yükselen trend dizilimi)");
      } else {
        s -= 10;
        reasons.push("EMA20 < EMA50 (düşen trend dizilimi)");
      }
    }

    // Price vs SMA20.
    if (ctx.sma20 !== null && ctx.lastClose !== null) {
      available++;
      if (ctx.lastClose > ctx.sma20) {
        s += 8;
        reasons.push("Fiyat 20 günlük ortalamanın üzerinde");
      } else {
        s -= 8;
        reasons.push("Fiyat 20 günlük ortalamanın altında");
      }
    }

    // Bollinger %B position.
    if (ctx.bollingerPctB !== null) {
      available++;
      const b = ctx.bollingerPctB;
      if (b > 100) {
        s -= 12;
        reasons.push("Bollinger üst bandının üzerinde (aşırı uzama)");
      } else if (b < 0) {
        s -= 8;
        reasons.push("Bollinger alt bandının altında");
      } else if (b >= 20 && b <= 80) {
        s += 6;
        reasons.push("Bollinger bandı içinde sağlıklı konum");
      }
    }

    return {
      score: clampScore(s),
      confidence: available / expected,
      weight: TECHNICAL_WEIGHT,
      reasons,
    };
  },
};
