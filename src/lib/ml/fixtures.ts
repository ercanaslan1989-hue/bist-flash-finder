// ============================================================================
// ML test fixtures — deterministic synthetic datasets with a KNOWN signal, so
// tests can assert that models learn, that training is reproducible, and that
// no future data leaks in.
// ============================================================================

import { mulberry32 } from "./gbdt";
import type { MlHorizon, Sample } from "./types";
import { ML_HORIZONS } from "./types";

const FEATURES = ["f_signal", "f_noise", "f_weak"];

function emptyLabels(): Record<MlHorizon, { up: 0 | 1 | null; forwardReturn: number | null; riskAdjusted: number | null }> {
  const o = {} as Record<MlHorizon, { up: 0 | 1 | null; forwardReturn: number | null; riskAdjusted: number | null }>;
  for (const h of ML_HORIZONS) o[h] = { up: null, forwardReturn: null, riskAdjusted: null };
  return o;
}

/**
 * Build `n` samples where the label depends deterministically on `f_signal`
 * (with a little seeded noise). A working learner must score well above 0.5 AUC.
 * Dates are sequential so time-series splitting is meaningful.
 */
export function makeLearnableDataset(n = 400, seed = 7): Sample[] {
  const rand = mulberry32(seed);
  const samples: Sample[] = [];
  const start = new Date("2023-01-01");
  for (let i = 0; i < n; i++) {
    const signal = rand() * 2 - 1; // [-1, 1]
    const noise = rand() * 2 - 1;
    const weak = rand() * 2 - 1;
    // Positive when signal high, with weak contribution + a bit of label noise.
    const logit = 3 * signal + 0.5 * weak + (rand() - 0.5);
    const up = logit > 0 ? 1 : 0;
    const ret = logit * 3; // return roughly proportional to the true edge
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const labels = emptyLabels();
    for (const h of ML_HORIZONS) {
      labels[h] = { up: up as 0 | 1, forwardReturn: ret, riskAdjusted: ret };
    }
    samples.push({
      symbol: `SYM${i % 20}`,
      date,
      features: { f_signal: signal, f_noise: noise, f_weak: weak },
      labels,
      championScore: 50 + signal * 25,
    });
  }
  return samples;
}

export { FEATURES };
