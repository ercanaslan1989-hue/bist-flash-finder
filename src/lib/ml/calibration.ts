// Confidence calibration — reliability diagram + Platt scaling.
// Fits a logistic (sigmoid) mapping from predicted confidence to observed
// hit-rate so displayed probabilities match reality. Look-ahead-free: uses
// only settled (hit/miss) predictions.

export interface CalibrationBin {
  binLow: number; // predicted lower bound (0..1)
  binHigh: number;
  predicted: number; // mean predicted probability in bin
  observed: number; // fraction that actually hit
  count: number;
}

export interface CalibrationResult {
  bins: CalibrationBin[];
  brier: number; // Brier score, lower is better
  ece: number; // Expected Calibration Error (weighted)
  platt: { a: number; b: number } | null; // p_cal = 1/(1+exp(a*p+b))
  sample: number;
}

export function computeCalibration(
  points: { predicted: number; hit: 0 | 1 }[],
  bins = 10,
): CalibrationResult {
  const filtered = points.filter(
    (p) => Number.isFinite(p.predicted) && (p.hit === 0 || p.hit === 1),
  );
  const n = filtered.length;
  if (n === 0) return { bins: [], brier: 0, ece: 0, platt: null, sample: 0 };

  // Reliability bins
  const out: CalibrationBin[] = [];
  let ece = 0;
  for (let i = 0; i < bins; i++) {
    const lo = i / bins;
    const hi = (i + 1) / bins;
    const inBin = filtered.filter(
      (p) => p.predicted >= lo && (i === bins - 1 ? p.predicted <= hi : p.predicted < hi),
    );
    if (!inBin.length) {
      out.push({ binLow: lo, binHigh: hi, predicted: (lo + hi) / 2, observed: 0, count: 0 });
      continue;
    }
    const predMean = inBin.reduce((a, b) => a + b.predicted, 0) / inBin.length;
    const obs = inBin.reduce((a, b) => a + b.hit, 0) / inBin.length;
    out.push({
      binLow: lo,
      binHigh: hi,
      predicted: round(predMean, 3),
      observed: round(obs, 3),
      count: inBin.length,
    });
    ece += (inBin.length / n) * Math.abs(predMean - obs);
  }
  const brier =
    filtered.reduce((a, p) => a + (p.predicted - p.hit) ** 2, 0) / n;

  // Platt scaling — fit p_cal = 1 / (1 + exp(a * p + b)) via gradient descent.
  let a = -1;
  let b = 0;
  const lr = 0.1;
  for (let step = 0; step < 400; step++) {
    let ga = 0;
    let gb = 0;
    for (const p of filtered) {
      const z = a * p.predicted + b;
      const q = 1 / (1 + Math.exp(z));
      const err = q - p.hit;
      ga += err * p.predicted;
      gb += err;
    }
    a -= (lr * ga) / n;
    b -= (lr * gb) / n;
  }

  return { bins: out, brier: round(brier, 4), ece: round(ece, 4), platt: { a, b }, sample: n };
}

export function applyPlatt(pRaw: number, platt: { a: number; b: number } | null): number {
  if (!platt) return pRaw;
  const z = platt.a * pRaw + platt.b;
  return 1 / (1 + Math.exp(z));
}

function round(x: number, d: number): number {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}
