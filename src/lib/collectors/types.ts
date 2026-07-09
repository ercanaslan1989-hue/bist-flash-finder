// ============================================================================
// Alternative Data & Sentiment Engine — shared contracts (FAZ 4).
//
// Every alternative-data source (KAP, financials, news, sector, macro, market
// breadth) is implemented as an independent *adapter* that speaks the common
// Collector interface below. Nothing here mutates the live Rule Engine, the ML
// pipeline or any existing API — collected features are additive and always
// carry provenance (source + timestamp + confidence + data quality).
//
// The framework is pure and deterministic: a Collector is driven by an injected
// async `source` function, so retry / timeout / dedupe / validation / ordering
// are all unit-testable without any real network access.
// ============================================================================

/** Sentiment polarity shared by KAP + news classifiers. */
export type Sentiment = "positive" | "neutral" | "negative";

/** Numeric sentiment in [-1, 1] mapped to a polarity bucket. */
export function toPolarity(score: number): Sentiment {
  if (score > 0.15) return "positive";
  if (score < -0.15) return "negative";
  return "neutral";
}

/** Per-item data-quality assessment attached to everything a collector emits. */
export interface DataQuality {
  /** 0-1 fraction of the expected fields that were present and valid. */
  completeness: number;
  /** True once the item passed the collector's structural validation. */
  valid: boolean;
  /** Age of the datum in days relative to the collection time (null if unknown). */
  ageDays: number | null;
  /** Human-readable validation issues (empty when clean). */
  issues: string[];
}

/** Where a datum came from and how much we trust it. */
export interface Provenance {
  /** Stable collector/source id, e.g. "kap", "macro". */
  source: string;
  /** ISO timestamp the value was collected (deterministic in tests via clock). */
  collectedAt: string;
  /** The "as of" business date the value refers to (YYYY-MM-DD), if any. */
  asOf: string | null;
  /** 0-1 confidence in the value (source reliability × data quality). */
  confidence: number;
  quality: DataQuality;
}

/** A single collected datum with full provenance. */
export interface DataPoint<T> {
  key: string;
  value: T;
  provenance: Provenance;
}

/** Structured error captured during a collection run (never thrown to caller). */
export interface CollectorError {
  kind: "timeout" | "network" | "validation" | "empty" | "unknown";
  message: string;
  /** Which attempt produced the error (1-based). */
  attempt: number;
}

/** Aggregate statistics for one collection run. */
export interface CollectorStats {
  received: number;
  valid: number;
  invalid: number;
  deduped: number;
  attempts: number;
}

/** The uniform result every collector returns — it never throws. */
export interface CollectorResult<TItem> {
  ok: boolean;
  source: string;
  items: TItem[];
  provenance: Provenance;
  errors: CollectorError[];
  stats: CollectorStats;
}

/** Options controlling resilience behaviour, injectable for tests. */
export interface CollectOptions {
  /** Max attempts including the first (default 3). */
  retries?: number;
  /** Base backoff in ms between attempts (default 200, set 0 in tests). */
  backoffMs?: number;
  /** Per-attempt timeout in ms (default 8000). */
  timeoutMs?: number;
  /** Deterministic clock for provenance timestamps (default Date.now). */
  now?: () => number;
  /** Injectable sleep so tests need not wait real time. */
  sleep?: (ms: number) => Promise<void>;
}

/** A raw data source — the only impure boundary, injected per collector. */
export type Source<TParams, TRaw> = (params: TParams) => Promise<TRaw[]>;

/** Common interface implemented by every alternative-data collector. */
export interface Collector<TParams, TItem> {
  readonly id: string;
  readonly label: string;
  collect(params: TParams, opts?: CollectOptions): Promise<CollectorResult<TItem>>;
}

/** Raised internally by the timeout wrapper (never surfaces to callers). */
export class CollectorTimeoutError extends Error {
  constructor(ms: number) {
    super(`Kaynak ${ms}ms içinde yanıt vermedi`);
    this.name = "CollectorTimeoutError";
  }
}
