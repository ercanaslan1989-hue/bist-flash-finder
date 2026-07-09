// ============================================================================
// NewsCollector — classifies news headlines from trusted sources into a
// sentiment (positive / neutral / negative) with a confidence score. Source
// reliability is factored into the confidence so a wire-service headline
// outranks an anonymous blog.
// ============================================================================

import { BaseCollector, daysBetween, isIsoDate } from "./base-collector";
import { scoreSentiment } from "./sentiment";
import { type Sentiment } from "./types";

/** Trusted source reliability weights (0-1). Unknown sources get a low prior. */
export const NEWS_SOURCE_RELIABILITY: Record<string, number> = {
  aa: 0.95, // Anadolu Ajansı
  reuters: 0.95,
  bloomberg: 0.95,
  "bloomberg ht": 0.9,
  foreks: 0.9,
  matriks: 0.9,
  kap: 0.98,
  dunya: 0.85,
  "dünya": 0.85,
  default: 0.6,
};

export interface RawNews {
  id?: string;
  symbol?: string | null;
  source?: string | null;
  title?: string;
  body?: string | null;
  published_at?: string;
  url?: string | null;
}

export interface NewsItem {
  id: string;
  symbol: string | null;
  source: string;
  sourceReliability: number;
  title: string;
  body: string | null;
  date: string;
  url: string | null;
  sentiment: Sentiment;
  sentimentScore: number;
  /** Confidence = text-signal confidence × source reliability. */
  confidence: number;
}

function reliabilityFor(source: string | null | undefined): number {
  const key = (source ?? "").toLocaleLowerCase("tr-TR").trim();
  return NEWS_SOURCE_RELIABILITY[key] ?? NEWS_SOURCE_RELIABILITY.default;
}

/** Classify a headline (+ optional body). Deterministic and side-effect-free. */
export function classifyNews(
  title: string,
  body: string | null | undefined,
  source?: string | null,
): Pick<NewsItem, "sentiment" | "sentimentScore" | "confidence" | "sourceReliability"> {
  const text = scoreSentiment(`${title} ${body ?? ""}`);
  const rel = reliabilityFor(source);
  return {
    sentiment: text.sentiment,
    sentimentScore: text.score,
    confidence: Math.min(1, text.confidence * rel),
    sourceReliability: rel,
  };
}

export class NewsCollector extends BaseCollector<
  { symbol?: string; since?: string },
  RawNews,
  NewsItem
> {
  readonly id = "news";
  readonly label = "Haber Duyarlılığı";

  protected reliability(): number {
    return 0.8;
  }

  protected map(raw: RawNews): NewsItem | null {
    const title = (raw.title ?? "").trim();
    const date = (raw.published_at ?? "").slice(0, 10);
    if (!title || !date) return null;
    const cls = classifyNews(title, raw.body, raw.source);
    return {
      id: raw.id ?? `${raw.source ?? "?"}:${date}:${title}`,
      symbol: raw.symbol ?? null,
      source: raw.source ?? "bilinmiyor",
      title,
      body: raw.body ?? null,
      date,
      url: raw.url ?? null,
      ...cls,
    };
  }

  protected validate(item: NewsItem): string[] {
    const issues: string[] = [];
    if (!item.title) issues.push("başlık eksik");
    if (!isIsoDate(item.date)) issues.push("geçersiz yayın tarihi");
    return issues;
  }

  protected qualityOf(item: NewsItem): { completeness: number; ageDays: number | null } {
    const fields = [item.title, item.body, item.symbol, item.url, item.source];
    const present = fields.filter((f) => f !== null && f !== "").length;
    return {
      completeness: present / fields.length,
      ageDays: daysBetween(item.date, new Date().toISOString().slice(0, 10)),
    };
  }

  protected dedupeKey(item: NewsItem): string {
    return `${item.source}:${item.date}:${item.title}`;
  }

  protected dateOf(item: NewsItem): string | null {
    return item.date;
  }
}

/** Symbol-level news sentiment summary for the Feature Store. */
export interface NewsSentimentSummary {
  symbol: string | null;
  count: number;
  positive: number;
  neutral: number;
  negative: number;
  /** Confidence-weighted mean sentiment in [-1, 1]. */
  netScore: number;
  avgConfidence: number;
  lastDate: string | null;
}

export function summarizeNews(items: NewsItem[], symbol?: string): NewsSentimentSummary {
  const rows = symbol ? items.filter((i) => i.symbol === symbol) : items;
  let wSum = 0;
  let wTot = 0;
  let confSum = 0;
  let pos = 0;
  let neu = 0;
  let neg = 0;
  let lastDate: string | null = null;
  for (const n of rows) {
    wSum += n.sentimentScore * n.confidence;
    wTot += n.confidence;
    confSum += n.confidence;
    if (n.sentiment === "positive") pos++;
    else if (n.sentiment === "negative") neg++;
    else neu++;
    if (lastDate === null || n.date > lastDate) lastDate = n.date;
  }
  return {
    symbol: symbol ?? null,
    count: rows.length,
    positive: pos,
    neutral: neu,
    negative: neg,
    netScore: wTot > 0 ? wSum / wTot : 0,
    avgConfidence: rows.length ? confSum / rows.length : 0,
    lastDate,
  };
}
