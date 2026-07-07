// ============================================================================
// LabelGenerator — builds supervised targets using ONLY future data.
//
// For a signal at index `i`, the forward return at horizon `h` is measured from
// close[i] to close[i+h]. Nothing at index <= i is used as a label, and nothing
// at index > i is ever used as a feature (features come from buildContextAt,
// which only reads [0..i]). This strict separation is what the look-ahead test
// asserts.
// ============================================================================

import type { PreparedSymbol } from "@/lib/backtest";
import { ML_HORIZONS, type LabelSet, type MlHorizon } from "./types";

/**
 * Standard deviation of the trailing daily returns up to and including `i`.
 * Used as a look-ahead-free volatility proxy for risk-adjusted labels.
 */
function trailingVol(rets: number[], i: number, window = 20): number {
  const start = Math.max(0, i - window + 1);
  const slice = rets.slice(start, i + 1);
  if (slice.length < 2) return 1;
  const mu = slice.reduce((a, b) => a + b, 0) / slice.length;
  const v = slice.reduce((a, b) => a + (b - mu) ** 2, 0) / (slice.length - 1);
  const sd = Math.sqrt(v);
  return sd > 1e-6 ? sd : 1;
}

/**
 * Generate labels for every horizon at index `i`. `upThreshold` is the forward
 * return (%) above which the binary "up" label is 1.
 */
export function generateLabels(
  sym: PreparedSymbol,
  i: number,
  upThreshold = 0,
): Record<MlHorizon, LabelSet> {
  const entry = sym.closes[i];
  const last = sym.closes.length - 1;
  const vol = trailingVol(sym.rets, i);

  const out = {} as Record<MlHorizon, LabelSet>;
  for (const h of ML_HORIZONS) {
    const j = i + h;
    if (j > last || entry <= 0) {
      out[h] = { up: null, forwardReturn: null, riskAdjusted: null };
      continue;
    }
    const ret = (sym.closes[j] / entry - 1) * 100;
    out[h] = {
      up: ret > upThreshold ? 1 : 0,
      forwardReturn: ret,
      riskAdjusted: ret / vol,
    };
  }
  return out;
}
