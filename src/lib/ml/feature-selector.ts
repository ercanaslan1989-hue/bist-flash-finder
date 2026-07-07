// ============================================================================
// FeatureSelector — deterministic, look-ahead-free feature pruning.
//
// Drops (1) near-constant features (variance below a floor) and (2) redundant
// features (|Pearson correlation| above a ceiling, keeping the higher-variance
// member of each correlated pair). Selection is computed on the TRAINING split
// only, so it never peeks at validation/test data. Output is a sorted name list
// — order-independent by construction.
// ============================================================================

import { allFeatureNames } from "./feature-vector";
import type { Sample } from "./types";

export interface SelectorOptions {
  minVariance: number;
  maxCorrelation: number;
  maxFeatures: number;
}

export const DEFAULT_SELECTOR: SelectorOptions = {
  minVariance: 1e-6,
  maxCorrelation: 0.95,
  maxFeatures: 40,
};

function columnStats(samples: Sample[], name: string): { mean: number; variance: number; n: number } {
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    const v = s.features[name];
    if (v != null && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  if (n === 0) return { mean: 0, variance: 0, n: 0 };
  const mean = sum / n;
  let ss = 0;
  for (const s of samples) {
    const v = s.features[name];
    if (v != null && Number.isFinite(v)) ss += (v - mean) ** 2;
  }
  return { mean, variance: n > 1 ? ss / (n - 1) : 0, n };
}

function pearson(samples: Sample[], a: string, b: string): number {
  let sa = 0;
  let sb = 0;
  let n = 0;
  for (const s of samples) {
    const va = s.features[a];
    const vb = s.features[b];
    if (va != null && vb != null && Number.isFinite(va) && Number.isFinite(vb)) {
      sa += va;
      sb += vb;
      n += 1;
    }
  }
  if (n < 2) return 0;
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let da = 0;
  let db = 0;
  for (const s of samples) {
    const va = s.features[a];
    const vb = s.features[b];
    if (va != null && vb != null && Number.isFinite(va) && Number.isFinite(vb)) {
      cov += (va - ma) * (vb - mb);
      da += (va - ma) ** 2;
      db += (vb - mb) ** 2;
    }
  }
  if (da <= 0 || db <= 0) return 0;
  return cov / Math.sqrt(da * db);
}

/**
 * Select features from the training split. Returns a sorted list of retained
 * feature names.
 */
export function selectFeatures(
  train: Sample[],
  options: Partial<SelectorOptions> = {},
): string[] {
  const opts = { ...DEFAULT_SELECTOR, ...options };
  const candidates = allFeatureNames();

  // 1) Variance filter — sort by descending variance for stable tie-breaks.
  const withVar = candidates
    .map((name) => ({ name, variance: columnStats(train, name).variance }))
    .filter((c) => c.variance > opts.minVariance)
    .sort((a, b) => b.variance - a.variance || a.name.localeCompare(b.name));

  // 2) Correlation filter — greedily keep, drop later members that correlate.
  const kept: string[] = [];
  for (const c of withVar) {
    if (kept.length >= opts.maxFeatures) break;
    const redundant = kept.some(
      (k) => Math.abs(pearson(train, c.name, k)) > opts.maxCorrelation,
    );
    if (!redundant) kept.push(c.name);
  }

  // Canonical (sorted) output so downstream order can never matter.
  return kept.sort((a, b) => a.localeCompare(b));
}
