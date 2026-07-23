// Feature drift detector — Population Stability Index (PSI) over key features
// (RSI, hacim oranı, 20g getiri) comparing recent window vs baseline window.
// PSI <0.1 stable, 0.1-0.25 uyarı, >0.25 belirgin kayma.

import { supabase } from "@/integrations/supabase/client";

export type DriftLevel = "stable" | "warning" | "shift";

export interface FeatureDrift {
  feature: string;
  psi: number;
  level: DriftLevel;
  baselineMean: number;
  recentMean: number;
}

export interface DriftReport {
  psi: number;
  level: DriftLevel;
  features: FeatureDrift[];
  baselineDays: number;
  recentDays: number;
  asOf: string;
}

const sb = supabase as unknown as { from: (t: string) => any };

interface Row {
  snapshot_date: string;
  daily_return_pct: number | null;
  vol_ratio_20d: number | null;
  ret_20d: number | null;
}

export async function detectDrift(recentDays = 20, baselineDays = 90): Promise<DriftReport> {
  const since = new Date();
  since.setDate(since.getDate() - (recentDays + baselineDays + 5));
  const { data, error } = await sb
    .from("daily_snapshots")
    .select("snapshot_date, daily_return_pct, vol_ratio_20d, ret_20d")
    .gte("snapshot_date", since.toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: false })
    .limit(60000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (!rows.length) {
    return {
      psi: 0,
      level: "stable",
      features: [],
      baselineDays,
      recentDays,
      asOf: new Date().toISOString().slice(0, 10),
    };
  }

  const dates = [...new Set(rows.map((r) => r.snapshot_date))].sort();
  const recentSet = new Set(dates.slice(-recentDays));
  const baselineSet = new Set(dates.slice(-recentDays - baselineDays, -recentDays));
  const recent = rows.filter((r) => recentSet.has(r.snapshot_date));
  const baseline = rows.filter((r) => baselineSet.has(r.snapshot_date));

  const features: FeatureDrift[] = [
    driftOf("Günlük getiri %", baseline, recent, (r) => r.daily_return_pct, [-8, -4, -2, -1, 0, 1, 2, 4, 8]),
    driftOf("Hacim/Ortalama", baseline, recent, (r) => r.vol_ratio_20d, [0.5, 0.75, 1, 1.25, 1.75, 2.5, 4]),
    driftOf("20g getiri %", baseline, recent, (r) => r.ret_20d, [-25, -15, -8, -3, 0, 3, 8, 15, 25]),
  ];

  const psi = features.reduce((a, b) => a + b.psi, 0) / (features.length || 1);
  const level: DriftLevel = psi > 0.25 ? "shift" : psi > 0.1 ? "warning" : "stable";
  return { psi: round(psi, 3), level, features, baselineDays, recentDays, asOf: dates[dates.length - 1] };
}

function driftOf(
  name: string,
  baseline: Row[],
  recent: Row[],
  pick: (r: Row) => number | null,
  edges: number[],
): FeatureDrift {
  const b = baseline.map(pick).filter((v): v is number => v != null && Number.isFinite(v));
  const r = recent.map(pick).filter((v): v is number => v != null && Number.isFinite(v));
  const psi = populationStabilityIndex(b, r, edges);
  const level: DriftLevel = psi > 0.25 ? "shift" : psi > 0.1 ? "warning" : "stable";
  return {
    feature: name,
    psi: round(psi, 3),
    level,
    baselineMean: round(mean(b), 2),
    recentMean: round(mean(r), 2),
  };
}

function populationStabilityIndex(a: number[], b: number[], edges: number[]): number {
  if (!a.length || !b.length) return 0;
  const bins = edges.length + 1;
  const ha = new Array(bins).fill(0);
  const hb = new Array(bins).fill(0);
  for (const v of a) ha[bucket(v, edges)]++;
  for (const v of b) hb[bucket(v, edges)]++;
  let psi = 0;
  for (let i = 0; i < bins; i++) {
    const pa = (ha[i] + 0.5) / (a.length + 0.5 * bins);
    const pb = (hb[i] + 0.5) / (b.length + 0.5 * bins);
    psi += (pb - pa) * Math.log(pb / pa);
  }
  return Math.max(0, psi);
}
function bucket(v: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return i;
  return edges.length;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round(x: number, d: number): number {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}
