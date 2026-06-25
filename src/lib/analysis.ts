import type { EventRow, FeatureRow } from "./research";

export interface Bucket {
  label: string;
  count: number;
  pct: number;
}

function buildBuckets(
  values: number[],
  bins: { label: string; test: (v: number) => boolean }[],
): Bucket[] {
  const total = values.length || 1;
  return bins.map((b) => {
    const count = values.filter((v) => b.test(v)).length;
    return { label: b.label, count, pct: (count / total) * 100 };
  });
}

const num = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && !Number.isNaN(v);

/** Features for a given lookback window (days before the event). 0 = all windows combined. */
export function filterFeatures(features: FeatureRow[], daysBefore: number): FeatureRow[] {
  if (daysBefore === 0) return features;
  return features.filter((f) => f.days_before === daysBefore);
}

export function volumeRatioBuckets(features: FeatureRow[]): Bucket[] {
  const values = features.map((f) => f.vol_ratio_20d).filter(num);
  return buildBuckets(values, [
    { label: "< 1×", test: (v) => v < 1 },
    { label: "1–1.5×", test: (v) => v >= 1 && v < 1.5 },
    { label: "1.5–2×", test: (v) => v >= 1.5 && v < 2 },
    { label: "2–3×", test: (v) => v >= 2 && v < 3 },
    { label: "3–5×", test: (v) => v >= 3 && v < 5 },
    { label: "5×+", test: (v) => v >= 5 },
  ]);
}

export function returnBuckets(features: FeatureRow[], key: "ret_5d" | "ret_10d"): Bucket[] {
  const values = features.map((f) => f[key]).filter(num);
  return buildBuckets(values, [
    { label: "< -5%", test: (v) => v < -5 },
    { label: "-5–0%", test: (v) => v >= -5 && v < 0 },
    { label: "0–5%", test: (v) => v >= 0 && v < 5 },
    { label: "5–10%", test: (v) => v >= 5 && v < 10 },
    { label: "10–20%", test: (v) => v >= 10 && v < 20 },
    { label: "20%+", test: (v) => v >= 20 },
  ]);
}

export function kapBuckets(features: FeatureRow[]): Bucket[] {
  const values = features.map((f) => f.kap_count).filter(num);
  return buildBuckets(values, [
    { label: "0", test: (v) => v === 0 },
    { label: "1", test: (v) => v === 1 },
    { label: "2", test: (v) => v === 2 },
    { label: "3+", test: (v) => v >= 3 },
  ]);
}

export function sectorBuckets(events: EventRow[]): Bucket[] {
  const total = events.length || 1;
  const map = new Map<string, number>();
  for (const e of events) {
    const s = e.sector ?? "Unknown";
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

function avg(values: number[]): number | null {
  const v = values.filter((x) => !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function median(values: number[]): number | null {
  const v = values.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface ProfileStat {
  metric: string;
  median: number | null;
  average: number | null;
  unit: "ratio" | "pct" | "num";
}

/** Median / average profile of all pre-event features for a window. */
export function preEventProfile(features: FeatureRow[]): ProfileStat[] {
  const get = (k: keyof FeatureRow) =>
    features.map((f) => f[k] as number).filter((v) => v !== null && v !== undefined);
  return [
    { metric: "Hacim oranı (20g ort.)", median: median(get("vol_ratio_20d")), average: avg(get("vol_ratio_20d")), unit: "ratio" },
    { metric: "Hacim oranı (önceki 2g)", median: median(get("vol_ratio_2d")), average: avg(get("vol_ratio_2d")), unit: "ratio" },
    { metric: "Hacim oranı (önceki 3g)", median: median(get("vol_ratio_3d")), average: avg(get("vol_ratio_3d")), unit: "ratio" },
    { metric: "5 günlük getiri", median: median(get("ret_5d")), average: avg(get("ret_5d")), unit: "pct" },
    { metric: "10 günlük getiri", median: median(get("ret_10d")), average: avg(get("ret_10d")), unit: "pct" },
    { metric: "20 günlük getiri", median: median(get("ret_20d")), average: avg(get("ret_20d")), unit: "pct" },
    { metric: "KAP bildirimleri", median: median(get("kap_count")), average: avg(get("kap_count")), unit: "num" },
  ];
}

export interface TopPattern {
  title: string;
  detail: string;
  share: number;
}

/** Headline recurring patterns for the Event Analysis dashboard. */
export function topPatterns(features: FeatureRow[], events: EventRow[]): TopPattern[] {
  const patterns: TopPattern[] = [];

  const vr = volumeRatioBuckets(features);
  const elevatedVol = vr.filter((b) => ["1.5–2×", "2–3×", "3–5×", "5×+"].includes(b.label));
  const elevatedShare = elevatedVol.reduce((a, b) => a + b.pct, 0);
  if (elevatedShare > 0)
    patterns.push({
      title: "Volume surge precedes the move",
      detail: `Volume ran ≥1.5× its 20-day average in the lead-up`,
      share: elevatedShare,
    });

  const r5 = returnBuckets(features, "ret_5d");
  const positiveR5 = r5.filter((b) => ["0–5%", "5–10%", "10–20%", "20%+"].includes(b.label));
  const r5Share = positiveR5.reduce((a, b) => a + b.pct, 0);
  patterns.push({
    title: "Quiet positive 5-day drift",
    detail: `Stock was already drifting up over the prior 5 sessions`,
    share: r5Share,
  });

  const kap = kapBuckets(features);
  const withKap = kap.filter((b) => b.label !== "0").reduce((a, b) => a + b.pct, 0);
  patterns.push({
    title: "Fresh KAP disclosure activity",
    detail: `At least one KAP announcement appeared in the window`,
    share: withKap,
  });

  const sectors = sectorBuckets(events);
  if (sectors[0])
    patterns.push({
      title: `Concentrated in ${sectors[0].label}`,
      detail: `Most frequent sector among large-move events`,
      share: sectors[0].pct,
    });

  return patterns.sort((a, b) => b.share - a.share);
}
