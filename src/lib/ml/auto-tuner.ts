// Auto-tuner — sistemin kendini her gece ayarlaması.
// Girdi: son 30 günün önerileri + gerçekleşen sonuçlar.
// Çıktı: yeni min_confidence eşiği + devre dışı bırakılacak zayıf kalıplar.
//
// Kurallar:
// - İsabet <%40  → eşik +5 (daha seçici)
// - İsabet %40-%50 → eşik +2
// - İsabet %50-%60 → değişiklik yok
// - İsabet %60-%70 → eşik -2 (daha çok fırsat)
// - İsabet >%70  → eşik -4
// - Eşik 40-85 arasında tutulur.

export interface TuneInput {
  hitRate: number | null;
  sampleSize: number;
  currentMinConfidence: number;
  weakPatterns?: string[]; // son 20 tahminde <%30 tutan kalıplar
}

export interface TuneDecision {
  newMinConfidence: number;
  action: "tighten" | "loosen" | "hold" | "insufficient_data";
  reason: string;
  delta: number;
  disablePatterns: string[];
}

export function decideTune(input: TuneInput): TuneDecision {
  const { hitRate, sampleSize, currentMinConfidence } = input;
  const disablePatterns = input.weakPatterns ?? [];

  if (hitRate == null || sampleSize < 5) {
    return {
      newMinConfidence: currentMinConfidence,
      action: "insufficient_data",
      reason: `Yeterli veri yok (settled=${sampleSize})`,
      delta: 0,
      disablePatterns,
    };
  }

  let delta = 0;
  let action: TuneDecision["action"] = "hold";
  let reason = "";

  if (hitRate < 0.4) {
    delta = 5;
    action = "tighten";
    reason = `İsabet %${(hitRate * 100).toFixed(0)} — eşik yükseltildi`;
  } else if (hitRate < 0.5) {
    delta = 2;
    action = "tighten";
    reason = `İsabet %${(hitRate * 100).toFixed(0)} — küçük sıkılaştırma`;
  } else if (hitRate < 0.6) {
    delta = 0;
    action = "hold";
    reason = `İsabet %${(hitRate * 100).toFixed(0)} — dengeli, değişiklik yok`;
  } else if (hitRate < 0.7) {
    delta = -2;
    action = "loosen";
    reason = `İsabet %${(hitRate * 100).toFixed(0)} — küçük gevşetme`;
  } else {
    delta = -4;
    action = "loosen";
    reason = `İsabet %${(hitRate * 100).toFixed(0)} — eşik düşürüldü`;
  }

  const newMinConfidence = Math.max(40, Math.min(85, currentMinConfidence + delta));
  if (newMinConfidence === currentMinConfidence && action !== "hold") {
    action = "hold";
    reason += ` (sınır: ${currentMinConfidence})`;
  }

  return { newMinConfidence, action, reason, delta: newMinConfidence - currentMinConfidence, disablePatterns };
}
