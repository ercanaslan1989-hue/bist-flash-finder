// ============================================================================
// Feature Store integration — turns alternative-data collector output into
// ML-ready features that the existing models can consume automatically.
//
// Every alt-data feature carries provenance (source, timestamp, confidence,
// data quality) so the Feature Store records not just the value but how much it
// should be trusted. `mergeAltFeatures` folds these into a base FeatureVector by
// name, so the ML pipeline picks them up with zero changes to the trainer.
// ============================================================================

import type { FeatureVector } from "@/lib/ml/types";
import type { KapSentimentSummary } from "./kap-collector";
import type { NewsSentimentSummary } from "./news-collector";
import type { FinancialSnapshot } from "./financial-collector";
import type { RelativePerformance } from "./sector-collector";
import type { MarketBreadth } from "./market-breadth-collector";

/** Alt-data feature schema version — bump when the alt feature set changes. */
export const ALT_FEATURE_VERSION = "afv1";

/** Provenance stored alongside every Feature Store value. */
export interface FeatureProvenance {
  source: string;
  timestamp: string;
  asOf: string | null;
  confidence: number;
  quality: number;
}

/** A single stored feature with its value + full provenance. */
export interface StoredFeature {
  name: string;
  value: number | null;
  provenance: FeatureProvenance;
}

/** Turkish labels for the alt-data features (dashboards + importance reports). */
export const ALT_FEATURE_LABELS: Record<string, string> = {
  kap_net_sentiment: "KAP Net Duyarlılık",
  kap_count_30d: "KAP Bildirim Sayısı",
  kap_positive_ratio: "KAP Pozitif Oranı",
  news_net_sentiment: "Haber Net Duyarlılık",
  news_count: "Haber Sayısı",
  news_confidence: "Haber Güveni",
  fin_health: "Finansal Sağlık",
  fin_revenue_growth: "Gelir Büyümesi",
  fin_net_margin: "Net Marj",
  fin_roe: "Özsermaye Kârlılığı",
  fin_leverage: "Borçluluk",
  sector_rel_20d: "Sektöre Göreli Getiri",
  sector_leader: "Sektör Lideri",
  market_breadth: "Piyasa Genişliği",
} as const;

export function altFeatureLabel(name: string): string {
  return ALT_FEATURE_LABELS[name] ?? name;
}

/** All alt-data feature names (canonical sorted order). */
export function altFeatureNames(): string[] {
  return Object.keys(ALT_FEATURE_LABELS).sort();
}

const now = () => new Date().toISOString();

const prov = (
  source: string,
  confidence: number,
  quality: number,
  asOf: string | null,
): FeatureProvenance => ({ source, timestamp: now(), asOf, confidence, quality });

/** Inputs used to assemble a symbol's alt-data feature set. */
export interface AltFeatureInputs {
  kap?: KapSentimentSummary;
  news?: NewsSentimentSummary;
  financial?: FinancialSnapshot;
  sector?: RelativePerformance;
  breadth?: MarketBreadth;
}

/**
 * Build the provenance-tracked alt-data feature set for one symbol.
 * Missing inputs simply produce fewer features (never throws).
 */
export function buildAltFeatures(inputs: AltFeatureInputs): StoredFeature[] {
  const out: StoredFeature[] = [];
  const push = (
    name: string,
    value: number | null,
    source: string,
    confidence: number,
    quality: number,
    asOf: string | null,
  ) => out.push({ name, value, provenance: prov(source, confidence, quality, asOf) });

  if (inputs.kap) {
    const k = inputs.kap;
    const conf = Math.min(1, 0.5 + Math.min(k.count, 5) * 0.1);
    push("kap_net_sentiment", k.netScore, "kap", conf, k.count ? 1 : 0, k.lastDate);
    push("kap_count_30d", k.count, "kap", 1, 1, k.lastDate);
    push(
      "kap_positive_ratio",
      k.count ? k.positive / k.count : null,
      "kap",
      conf,
      k.count ? 1 : 0,
      k.lastDate,
    );
  }

  if (inputs.news) {
    const n = inputs.news;
    push("news_net_sentiment", n.netScore, "news", n.avgConfidence, n.count ? 1 : 0, n.lastDate);
    push("news_count", n.count, "news", 1, 1, n.lastDate);
    push("news_confidence", n.avgConfidence, "news", 1, n.count ? 1 : 0, n.lastDate);
  }

  if (inputs.financial) {
    const f = inputs.financial;
    push("fin_health", f.healthScore, "financial", 0.85, 1, f.date);
    push("fin_revenue_growth", f.revenueGrowth, "financial", 0.85, f.revenueGrowth != null ? 1 : 0, f.date);
    push("fin_net_margin", f.netMargin, "financial", 0.85, f.netMargin != null ? 1 : 0, f.date);
    push("fin_roe", f.roe, "financial", 0.85, f.roe != null ? 1 : 0, f.date);
    push("fin_leverage", f.leverage, "financial", 0.85, f.leverage != null ? 1 : 0, f.date);
  }

  if (inputs.sector) {
    const s = inputs.sector;
    push("sector_rel_20d", s.relative20d, "sector", 0.9, s.relative20d != null ? 1 : 0, null);
    push("sector_leader", s.isLeader ? 1 : 0, "sector", 0.9, 1, null);
  }

  if (inputs.breadth) {
    push("market_breadth", inputs.breadth.score, "breadth", 0.9, 1, inputs.breadth.date);
  }

  return out;
}

/**
 * Fold alt-data features into a base ML feature vector, keyed by name so the
 * trainer/predictor pick them up automatically (order-independent). Only
 * features whose confidence meets `minConfidence` are merged; the rest are
 * left as missing (null), which the GBDT handles natively.
 */
export function mergeAltFeatures(
  base: FeatureVector,
  features: StoredFeature[],
  minConfidence = 0.3,
): FeatureVector {
  const merged: FeatureVector = { ...base };
  for (const f of features) {
    merged[f.name] = f.provenance.confidence >= minConfidence ? f.value : null;
  }
  return merged;
}

/** Aggregate data-quality report across a set of stored features. */
export interface FeatureQualityReport {
  total: number;
  populated: number;
  avgConfidence: number;
  bySource: Record<string, { count: number; avgConfidence: number }>;
}

export function featureQuality(features: StoredFeature[]): FeatureQualityReport {
  const bySource: Record<string, { count: number; sum: number }> = {};
  let populated = 0;
  let confSum = 0;
  for (const f of features) {
    if (f.value != null) populated++;
    confSum += f.provenance.confidence;
    const b = (bySource[f.provenance.source] ??= { count: 0, sum: 0 });
    b.count++;
    b.sum += f.provenance.confidence;
  }
  return {
    total: features.length,
    populated,
    avgConfidence: features.length ? confSum / features.length : 0,
    bySource: Object.fromEntries(
      Object.entries(bySource).map(([k, v]) => [
        k,
        { count: v.count, avgConfidence: v.count ? v.sum / v.count : 0 },
      ]),
    ),
  };
}
