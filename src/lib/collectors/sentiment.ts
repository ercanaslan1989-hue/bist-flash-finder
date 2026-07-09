// ============================================================================
// Turkish sentiment lexicon — a small, deterministic, dependency-free scorer
// shared by the KAP and news classifiers. It is intentionally transparent
// (keyword weights, not a black box) so results are reproducible and auditable.
// ============================================================================

import { type Sentiment, toPolarity } from "./types";

/** Positive keywords (stems, lowercase, Turkish + finance terms). */
const POSITIVE: Record<string, number> = {
  kâr: 0.6,
  kar: 0.5,
  kazanç: 0.6,
  büyüme: 0.6,
  arttı: 0.5,
  artış: 0.5,
  yükseldi: 0.5,
  yükseliş: 0.5,
  rekor: 0.7,
  anlaşma: 0.5,
  sözleşme: 0.5,
  ihale: 0.5,
  kazandı: 0.7,
  temettü: 0.6,
  bedelsiz: 0.7,
  "geri alım": 0.6,
  yatırım: 0.4,
  ortaklık: 0.4,
  teşvik: 0.5,
  onaylandı: 0.4,
  tamamlandı: 0.3,
  ihracat: 0.4,
  güçlü: 0.5,
  olumlu: 0.5,
  başarı: 0.5,
  genişleme: 0.4,
};

/** Negative keywords. */
const NEGATIVE: Record<string, number> = {
  zarar: 0.7,
  düşüş: 0.5,
  düştü: 0.5,
  azaldı: 0.5,
  azalış: 0.5,
  gerileme: 0.5,
  iptal: 0.6,
  fesih: 0.7,
  dava: 0.5,
  ceza: 0.6,
  soruşturma: 0.6,
  iflas: 0.9,
  konkordato: 0.9,
  borç: 0.3,
  temerrüt: 0.8,
  kayıp: 0.6,
  gecikme: 0.4,
  olumsuz: 0.6,
  durduruldu: 0.6,
  uyarı: 0.4,
  "sermaye azaltımı": 0.6,
  istifa: 0.4,
  küçülme: 0.5,
};

export interface SentimentResult {
  sentiment: Sentiment;
  /** Continuous score in [-1, 1]. */
  score: number;
  /** 0-1 confidence — grows with the number of matched terms. */
  confidence: number;
  /** The matched keywords (for explainability). */
  matched: string[];
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr-TR");
}

/**
 * Score arbitrary Turkish text. Deterministic: same input → same output.
 * Confidence reflects how much signal (matched terms) was found.
 */
export function scoreSentiment(text: string | null | undefined): SentimentResult {
  if (!text || !text.trim()) {
    return { sentiment: "neutral", score: 0, confidence: 0, matched: [] };
  }
  const t = normalize(text);
  let pos = 0;
  let neg = 0;
  const matched: string[] = [];

  for (const [word, w] of Object.entries(POSITIVE)) {
    if (t.includes(word)) {
      pos += w;
      matched.push(word);
    }
  }
  for (const [word, w] of Object.entries(NEGATIVE)) {
    if (t.includes(word)) {
      neg += w;
      matched.push(word);
    }
  }

  const total = pos + neg;
  if (total === 0) {
    return { sentiment: "neutral", score: 0, confidence: 0.2, matched: [] };
  }
  // Net polarity normalised by magnitude, squashed to keep within [-1, 1].
  const raw = (pos - neg) / total;
  const score = Math.max(-1, Math.min(1, raw));
  // Confidence saturates as more terms match.
  const confidence = Math.min(1, 0.35 + Math.min(matched.length, 5) * 0.13);
  return { sentiment: toPolarity(score), score, confidence, matched };
}
