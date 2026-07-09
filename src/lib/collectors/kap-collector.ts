// ============================================================================
// KapCollector — collects & classifies KAP (Public Disclosure Platform)
// filings. Each disclosure is classified into a business category and assigned
// a sentiment (positive / neutral / negative) with a confidence score.
// ============================================================================

import { BaseCollector, daysBetween, isIsoDate } from "./base-collector";
import { scoreSentiment } from "./sentiment";
import { type Sentiment, toPolarity } from "./types";

/** Canonical KAP disclosure categories (matches the FAZ 4 taxonomy). */
export type KapCategory =
  | "yeni_is_anlasmasi"
  | "ihale"
  | "bedelsiz"
  | "bedelli"
  | "temettu"
  | "geri_alim"
  | "ortaklik"
  | "yatirim"
  | "finansal_sonuc"
  | "yonetim_degisikligi"
  | "diger";

export const KAP_CATEGORY_LABELS: Record<KapCategory, string> = {
  yeni_is_anlasmasi: "Yeni iş anlaşması",
  ihale: "İhale",
  bedelsiz: "Bedelsiz sermaye artırımı",
  bedelli: "Bedelli sermaye artırımı",
  temettu: "Temettü",
  geri_alim: "Geri alım",
  ortaklik: "Ortaklık",
  yatirim: "Yatırım",
  finansal_sonuc: "Finansal sonuç",
  yonetim_degisikligi: "Yönetim değişikliği",
  diger: "Diğer",
};

/** Baseline sentiment bias per category (before text analysis). */
const CATEGORY_BIAS: Record<KapCategory, number> = {
  yeni_is_anlasmasi: 0.5,
  ihale: 0.45,
  bedelsiz: 0.55,
  bedelli: -0.35,
  temettu: 0.4,
  geri_alim: 0.5,
  ortaklik: 0.25,
  yatirim: 0.3,
  finansal_sonuc: 0,
  yonetim_degisikligi: -0.1,
  diger: 0,
};

/** Ordered keyword rules — first match wins. */
const CATEGORY_RULES: { category: KapCategory; keywords: string[] }[] = [
  { category: "bedelsiz", keywords: ["bedelsiz"] },
  { category: "bedelli", keywords: ["bedelli", "rüçhan", "sermaye artırım"] },
  { category: "temettu", keywords: ["temettü", "kâr payı", "kar payı"] },
  { category: "geri_alim", keywords: ["geri alım", "geri alim", "pay geri"] },
  { category: "ihale", keywords: ["ihale", "yüklenici"] },
  { category: "yeni_is_anlasmasi", keywords: ["sözleşme", "anlaşma", "sipariş", "kontrat"] },
  { category: "ortaklik", keywords: ["ortaklık", "iştirak", "birleşme", "satın alma", "devir"] },
  { category: "yatirim", keywords: ["yatırım", "kapasite", "fabrika", "tesis", "üretim tesisi"] },
  {
    category: "finansal_sonuc",
    keywords: ["finansal rapor", "bilanço", "faaliyet raporu", "finansal sonuç", "net dönem"],
  },
  {
    category: "yonetim_degisikligi",
    keywords: ["yönetim kurulu", "genel müdür", "istifa", "atama", "görevden"],
  },
];

/** Raw KAP row shape (matches the kap_disclosures table + generic sources). */
export interface RawKapDisclosure {
  id?: string;
  symbol?: string;
  company_name?: string | null;
  disclosure_date?: string;
  disclosure_time?: string | null;
  disclosure_type?: string | null;
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  source_id?: string | null;
}

/** A classified KAP disclosure. */
export interface KapDisclosure {
  id: string;
  symbol: string;
  companyName: string | null;
  date: string;
  time: string | null;
  title: string;
  summary: string | null;
  category: KapCategory;
  categoryLabel: string;
  sentiment: Sentiment;
  /** Blended sentiment score in [-1, 1]. */
  sentimentScore: number;
  /** 0-1 confidence in the classification. */
  confidence: number;
}

/** Pure classifier — exported for direct reuse & unit testing. */
export function classifyKapCategory(title: string, summary?: string | null): KapCategory {
  const text = `${title} ${summary ?? ""}`.toLocaleLowerCase("tr-TR");
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.category;
  }
  return "diger";
}

/** Full classification: category + sentiment + confidence. */
export function classifyKap(
  title: string,
  summary?: string | null,
): Pick<KapDisclosure, "category" | "categoryLabel" | "sentiment" | "sentimentScore" | "confidence"> {
  const category = classifyKapCategory(title, summary);
  const text = scoreSentiment(`${title} ${summary ?? ""}`);
  const bias = CATEGORY_BIAS[category];
  // Blend the category prior with observed text sentiment. The text term is
  // weighted by its own confidence, so a strongly-worded filing can override
  // the category prior while a bare title falls back to the prior.
  const finalScore = Math.max(
    -1,
    Math.min(1, bias * (1 - text.confidence) + text.score * text.confidence),
  );
  const confidence = Math.min(1, 0.4 + text.confidence * 0.5 + (category !== "diger" ? 0.1 : 0));
  return {
    category,
    categoryLabel: KAP_CATEGORY_LABELS[category],
    sentiment: toPolarity(finalScore),
    sentimentScore: finalScore,
    confidence,
  };
}

export class KapCollector extends BaseCollector<
  { symbol?: string; since?: string },
  RawKapDisclosure,
  KapDisclosure
> {
  readonly id = "kap";
  readonly label = "KAP Bildirimleri";

  protected reliability(): number {
    return 0.95; // KAP is an official primary source.
  }

  protected map(raw: RawKapDisclosure): KapDisclosure | null {
    const title = (raw.title ?? "").trim();
    const date = raw.disclosure_date ?? "";
    if (!raw.symbol || !title || !date) return null;
    const cls = classifyKap(title, raw.summary);
    return {
      id: raw.id ?? `${raw.symbol}:${date}:${raw.source_id ?? title}`,
      symbol: raw.symbol,
      companyName: raw.company_name ?? null,
      date,
      time: raw.disclosure_time ?? null,
      title,
      summary: raw.summary ?? null,
      ...cls,
    };
  }

  protected validate(item: KapDisclosure): string[] {
    const issues: string[] = [];
    if (!item.symbol) issues.push("symbol eksik");
    if (!item.title) issues.push("başlık eksik");
    if (!isIsoDate(item.date)) issues.push("geçersiz tarih");
    return issues;
  }

  protected qualityOf(item: KapDisclosure): { completeness: number; ageDays: number | null } {
    const fields = [item.symbol, item.title, item.summary, item.companyName, item.time];
    const present = fields.filter((f) => f !== null && f !== "").length;
    const ageDays = daysBetween(item.date, new Date().toISOString().slice(0, 10));
    return { completeness: present / fields.length, ageDays };
  }

  protected dedupeKey(item: KapDisclosure): string {
    return `${item.symbol}:${item.date}:${item.title}`;
  }

  protected dateOf(item: KapDisclosure): string | null {
    return item.date;
  }
}

/** Aggregate a symbol's disclosures into a compact sentiment feature. */
export interface KapSentimentSummary {
  symbol: string;
  count: number;
  positive: number;
  neutral: number;
  negative: number;
  /** Mean sentiment score in [-1, 1]. */
  netScore: number;
  /** Category → count. */
  byCategory: Record<string, number>;
  lastDate: string | null;
}

export function summarizeKap(symbol: string, items: KapDisclosure[]): KapSentimentSummary {
  const own = items.filter((i) => i.symbol === symbol);
  const byCategory: Record<string, number> = {};
  let scoreSum = 0;
  let pos = 0;
  let neu = 0;
  let neg = 0;
  let lastDate: string | null = null;
  for (const d of own) {
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    scoreSum += d.sentimentScore;
    if (d.sentiment === "positive") pos++;
    else if (d.sentiment === "negative") neg++;
    else neu++;
    if (lastDate === null || d.date > lastDate) lastDate = d.date;
  }
  return {
    symbol,
    count: own.length,
    positive: pos,
    neutral: neu,
    negative: neg,
    netScore: own.length ? scoreSum / own.length : 0,
    byCategory,
    lastDate,
  };
}
