// ============================================================================
// BaseCollector — the resilience + quality core shared by every adapter.
//
// A concrete collector supplies a `source` (the only impure part), plus small
// pure hooks: validate(), qualityOf(), dedupeKey(), dateOf(), reliability().
// Everything else — retry with backoff, per-attempt timeout, deduplication,
// chronological ordering, provenance stamping and structured error capture —
// lives here and is fully deterministic under injected clock/sleep.
// ============================================================================

import {
  type Collector,
  type CollectOptions,
  type CollectorError,
  type CollectorResult,
  type DataQuality,
  type Provenance,
  type Source,
  CollectorTimeoutError,
} from "./types";

const DEFAULTS = {
  retries: 3,
  backoffMs: 200,
  timeoutMs: 8000,
} as const;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Race a promise against a timeout that rejects with CollectorTimeoutError. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CollectorTimeoutError(ms)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function classifyError(e: unknown): CollectorError["kind"] {
  if (e instanceof CollectorTimeoutError) return "timeout";
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e);
  if (msg.includes("timeout")) return "timeout";
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("econn")) return "network";
  return "unknown";
}

export abstract class BaseCollector<TParams, TRaw, TItem>
  implements Collector<TParams, TItem>
{
  abstract readonly id: string;
  abstract readonly label: string;

  /** Baseline trust in this source (0-1). Blended with per-item data quality. */
  protected reliability(): number {
    return 0.9;
  }

  /** Map a raw record to a domain item, or null to drop it. */
  protected abstract map(raw: TRaw): TItem | null;

  /** Structural validation — return the list of issues (empty = valid). */
  protected abstract validate(item: TItem): string[];

  /** Per-item completeness/quality (0-1 completeness + age). */
  protected abstract qualityOf(item: TItem): { completeness: number; ageDays: number | null };

  /** Stable key used to drop duplicate items (last write wins). */
  protected abstract dedupeKey(item: TItem): string;

  /** Business date (YYYY-MM-DD) used to order items ascending. Null sorts last. */
  protected abstract dateOf(item: TItem): string | null;

  constructor(protected readonly source: Source<TParams, TRaw>) {}

  async collect(params: TParams, opts: CollectOptions = {}): Promise<CollectorResult<TItem>> {
    const retries = opts.retries ?? DEFAULTS.retries;
    const backoffMs = opts.backoffMs ?? DEFAULTS.backoffMs;
    const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
    const now = opts.now ?? Date.now;
    const sleep = opts.sleep ?? defaultSleep;

    const errors: CollectorError[] = [];
    let raw: TRaw[] | null = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
      attempts = attempt;
      try {
        raw = await withTimeout(this.source(params), timeoutMs);
        break;
      } catch (e) {
        errors.push({
          kind: classifyError(e),
          message: e instanceof Error ? e.message : String(e),
          attempt,
        });
        if (attempt < retries) await sleep(backoffMs * attempt);
      }
    }

    const collectedAt = new Date(now()).toISOString();

    if (raw === null) {
      return this.emptyResult(collectedAt, errors, attempts);
    }

    // Map + validate.
    let invalid = 0;
    const mapped: TItem[] = [];
    for (const r of raw) {
      const item = this.map(r);
      if (item === null) {
        invalid++;
        continue;
      }
      const issues = this.validate(item);
      if (issues.length > 0) {
        invalid++;
        errors.push({ kind: "validation", message: issues.join("; "), attempt: attempts });
        continue;
      }
      mapped.push(item);
    }
    const received = raw.length;

    // Deduplicate (last occurrence wins), then order chronologically.
    const byKey = new Map<string, TItem>();
    for (const item of mapped) byKey.set(this.dedupeKey(item), item);
    const deduped = mapped.length - byKey.size;
    const items = [...byKey.values()].sort((a, b) => {
      const da = this.dateOf(a);
      const db = this.dateOf(b);
      if (da === db) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    });

    const provenance = this.buildProvenance(items, collectedAt, now);
    if (items.length === 0 && errors.every((e) => e.kind !== "validation")) {
      errors.push({ kind: "empty", message: "Kaynak boş sonuç döndürdü", attempt: attempts });
    }

    return {
      ok: items.length > 0,
      source: this.id,
      items,
      provenance,
      errors,
      stats: { received, valid: items.length, invalid, deduped, attempts },
    };
  }

  /** Aggregate provenance across all items (mean completeness, freshest asOf). */
  private buildProvenance(items: TItem[], collectedAt: string, now: () => number): Provenance {
    let completenessSum = 0;
    let ageSum = 0;
    let ageCount = 0;
    let latest: string | null = null;
    const issues: string[] = [];
    for (const item of items) {
      const q = this.qualityOf(item);
      completenessSum += q.completeness;
      if (q.ageDays !== null) {
        ageSum += q.ageDays;
        ageCount++;
      }
      const d = this.dateOf(item);
      if (d && (latest === null || d > latest)) latest = d;
    }
    const n = items.length || 1;
    const completeness = items.length ? completenessSum / n : 0;
    const ageDays = ageCount ? ageSum / ageCount : null;
    const quality: DataQuality = {
      completeness,
      valid: items.length > 0,
      ageDays,
      issues,
    };
    const confidence = Math.max(0, Math.min(1, this.reliability() * completeness));
    return { source: this.id, collectedAt, asOf: latest, confidence, quality };
  }

  private emptyResult(
    collectedAt: string,
    errors: CollectorError[],
    attempts: number,
  ): CollectorResult<TItem> {
    return {
      ok: false,
      source: this.id,
      items: [],
      provenance: {
        source: this.id,
        collectedAt,
        asOf: null,
        confidence: 0,
        quality: { completeness: 0, valid: false, ageDays: null, issues: ["Kaynak yanıt vermedi"] },
      },
      errors,
      stats: { received: 0, valid: 0, invalid: 0, deduped: 0, attempts },
    };
  }
}

/** Days between two YYYY-MM-DD dates (b - a), or null if either missing. */
export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86_400_000);
}

/** True for a well-formed YYYY-MM-DD date string. */
export function isIsoDate(d: unknown): d is string {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) && !Number.isNaN(Date.parse(d));
}
