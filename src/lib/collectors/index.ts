// ============================================================================
// Alternative Data & Sentiment Engine — public surface (FAZ 4).
//
// Modular alt-data collectors that run entirely in parallel with the live Rule
// Engine and ML pipeline. Each source is an independent adapter over the common
// Collector interface; collected values carry provenance and feed the Feature
// Store, which the ML models consume automatically.
// ============================================================================

export * from "./types";

export { BaseCollector, daysBetween, isIsoDate } from "./base-collector";

export { scoreSentiment, type SentimentResult } from "./sentiment";

export {
  KapCollector,
  classifyKap,
  classifyKapCategory,
  summarizeKap,
  KAP_CATEGORY_LABELS,
  type KapCategory,
  type KapDisclosure,
  type KapSentimentSummary,
  type RawKapDisclosure,
} from "./kap-collector";

export {
  NewsCollector,
  classifyNews,
  summarizeNews,
  NEWS_SOURCE_RELIABILITY,
  type NewsItem,
  type NewsSentimentSummary,
  type RawNews,
} from "./news-collector";

export {
  FinancialCollector,
  financialHealth,
  type FinancialSnapshot,
  type RawFinancial,
} from "./financial-collector";

export {
  MacroCollector,
  groupMacroSeries,
  macroSnapshots,
  MACRO_LABELS,
  MACRO_INDICATORS,
  type MacroIndicator,
  type MacroPoint,
  type MacroSnapshot,
  type RawMacro,
} from "./macro-collector";

export {
  SectorCollector,
  computeSectorStats,
  rankSectors,
  relativeToSector,
  type SectorRow,
  type SectorStats,
  type RelativePerformance,
  type RawSectorRow,
} from "./sector-collector";

export {
  MarketBreadthCollector,
  computeBreadth,
  type BreadthRow,
  type MarketBreadth,
  type RawBreadthRow,
} from "./market-breadth-collector";

export {
  ALT_FEATURE_VERSION,
  ALT_FEATURE_LABELS,
  altFeatureLabel,
  altFeatureNames,
  buildAltFeatures,
  mergeAltFeatures,
  featureQuality,
  type AltFeatureInputs,
  type StoredFeature,
  type FeatureProvenance,
  type FeatureQualityReport,
} from "./feature-store";
