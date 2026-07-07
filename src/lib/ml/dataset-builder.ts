// ============================================================================
// DatasetBuilder — turns prepared symbol history into supervised Samples.
//
// Reuses the backtest engine's `buildContextAt` (look-ahead-free features) and
// this module's `generateLabels` (future-only targets). Read-only: it never
// writes to any live table. Async with cooperative yielding so a full-universe
// build keeps the UI responsive and can be aborted.
// ============================================================================

import {
  buildContextAt,
  loadBacktestData,
  fetchLatestSnapshotDate,
  type PreparedSymbol,
} from "@/lib/backtest";
import { extractFeatures } from "./feature-vector";
import { generateLabels } from "./label-generator";
import { MlAbortError, type MlProgress, type Sample } from "./types";

export interface DatasetParams {
  startDate: string;
  endDate: string;
  /** Trading sessions of warmup before a symbol becomes eligible. */
  warmup: number;
  /** Forward return (%) above which the binary "up" label is 1. */
  upThreshold: number;
}

export const DEFAULT_DATASET_PARAMS: DatasetParams = {
  startDate: "",
  endDate: "",
  warmup: 50,
  upThreshold: 0,
};

export interface BuildOptions {
  onProgress?: (p: MlProgress) => void;
  signal?: AbortSignal;
  chunkSize?: number;
}

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Build samples from an already-prepared universe (pure, testable core). */
export function buildSamplesFromUniverse(
  universe: PreparedSymbol[],
  params: DatasetParams,
): Sample[] {
  const samples: Sample[] = [];
  for (const sym of universe) {
    for (let i = params.warmup; i < sym.closes.length; i++) {
      const date = sym.dates[i];
      if (date < params.startDate || date > params.endDate) continue;
      const labels = generateLabels(sym, i, params.upThreshold);
      // Keep only rows with at least the shortest-horizon label settled.
      if (labels[1].up == null) continue;
      const ctx = buildContextAt(sym, i);
      samples.push({
        symbol: sym.symbol,
        date,
        features: extractFeatures(ctx),
        labels,
        championScore: sym.legacyByDate.get(date) ?? null,
      });
    }
  }
  return samples;
}

/** Async wrapper adding progress reporting + abort support. */
export async function buildSamplesAsync(
  universe: PreparedSymbol[],
  params: DatasetParams,
  opts: BuildOptions = {},
): Promise<Sample[]> {
  const { onProgress, signal, chunkSize = 20 } = opts;
  const samples: Sample[] = [];
  const total = universe.length;
  let processed = 0;
  for (const sym of universe) {
    if (signal?.aborted) throw new MlAbortError();
    samples.push(...buildSamplesFromUniverse([sym], params));
    processed += 1;
    if (processed % chunkSize === 0 || processed === total) {
      onProgress?.({
        phase: "dataset",
        processed,
        total,
        percent: total ? Math.round((processed / total) * 100) : 100,
      });
      await nextTick();
    }
  }
  // Chronological order is required for time-series splitting.
  samples.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return samples;
}

/** Convenience: load history from the DB and build the dataset end-to-end. */
export async function buildDataset(
  params: DatasetParams,
  opts: BuildOptions = {},
): Promise<Sample[]> {
  const universe = await loadBacktestData(
    { ...params, minScore: 0, target: 10 },
    { signal: opts.signal },
  );
  return buildSamplesAsync(universe, params, opts);
}

export { fetchLatestSnapshotDate };
