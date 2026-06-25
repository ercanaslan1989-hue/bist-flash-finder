import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

// The generated Database type has no tables until regenerated, so we use a
// loosely-typed handle and cast row shapes ourselves.
const sb = supabase as unknown as {
  from: (table: string) => any;
};

export interface EventRow {
  id: string;
  symbol: string;
  event_date: string;
  event_type: string;
  is_limit_up: boolean;
  daily_return_pct: number;
  sector: string | null;
}

export interface FeatureRow {
  id: string;
  event_id: string;
  symbol: string;
  days_before: number;
  feature_date: string;
  close: number | null;
  daily_return_pct: number | null;
  volume: number | null;
  vol_ratio_20d: number | null;
  vol_ratio_2d: number | null;
  vol_ratio_3d: number | null;
  ret_5d: number | null;
  ret_10d: number | null;
  ret_20d: number | null;
  ret_30d: number | null;
  market_value: number | null;
  daily_traded_value: number | null;
  kap_count: number | null;
  sector: string | null;
}

export interface SnapshotRow {
  symbol: string;
  snapshot_date: string;
  close: number;
  daily_return_pct: number | null;
  volume: number;
  vol_ratio_20d: number | null;
  vol_ratio_2d: number | null;
  vol_ratio_3d: number | null;
  ret_5d: number | null;
  ret_10d: number | null;
  ret_20d: number | null;
  ret_30d: number | null;
  market_value: number | null;
  daily_traded_value: number | null;
  kap_count: number;
  last_kap_date: string | null;
  stocks: { company_name: string; sector: string } | null;
}

export interface ResearchData {
  events: EventRow[];
  features: FeatureRow[];
  meta: {
    stockCount: number;
    snapshotCount: number;
    firstDate: string | null;
    lastDate: string | null;
  };
}

async function fetchResearch(): Promise<ResearchData> {
  const [eventsRes, featuresRes, stockCountRes, snapCountRes, firstRes, lastRes] =
    await Promise.all([
      sb.from("events").select("*").order("event_date", { ascending: false }),
      sb.from("event_features").select("*"),
      sb.from("stocks").select("symbol", { count: "exact", head: true }),
      sb.from("daily_snapshots").select("id", { count: "exact", head: true }),
      sb
        .from("daily_snapshots")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: true })
        .limit(1),
      sb
        .from("daily_snapshots")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1),
    ]);

  return {
    events: (eventsRes.data ?? []) as EventRow[],
    features: (featuresRes.data ?? []) as FeatureRow[],
    meta: {
      stockCount: stockCountRes.count ?? 0,
      snapshotCount: snapCountRes.count ?? 0,
      firstDate: firstRes.data?.[0]?.snapshot_date ?? null,
      lastDate: lastRes.data?.[0]?.snapshot_date ?? null,
    },
  };
}

export const researchQueryOptions = () =>
  queryOptions({
    queryKey: ["research"],
    queryFn: fetchResearch,
    staleTime: 60_000,
  });

async function fetchLatestSnapshots(): Promise<SnapshotRow[]> {
  const lastRes = await sb
    .from("daily_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const lastDate: string | undefined = lastRes.data?.[0]?.snapshot_date;
  if (!lastDate) return [];

  const res = await sb
    .from("daily_snapshots")
    .select(
      "symbol, snapshot_date, close, daily_return_pct, volume, vol_ratio_20d, vol_ratio_2d, vol_ratio_3d, ret_5d, ret_10d, ret_20d, ret_30d, market_value, daily_traded_value, kap_count, last_kap_date, stocks(company_name, sector)",
    )
    .eq("snapshot_date", lastDate)
    .order("daily_traded_value", { ascending: false });

  return (res.data ?? []) as SnapshotRow[];
}

export const latestSnapshotsQueryOptions = () =>
  queryOptions({
    queryKey: ["latest-snapshots"],
    queryFn: fetchLatestSnapshots,
    staleTime: 60_000,
  });

// ===== Validated research signals =====

export interface SignalRow {
  id: string;
  event_type: "limit_up" | "run_20" | string;
  horizon: number;
  signal_key: string;
  signal_label: string;
  occurrences: number | null;
  successes: number | null;
  failures: number | null;
  precision_pct: number | null;
  recall_pct: number | null;
  fpr_pct: number | null;
  base_rate_pct: number | null;
  lift: number | null;
  avg_fwd_max20: number | null;
  median_fwd_max20: number | null;
  avg_days_to_target: number | null;
  rank: number | null;
}

export interface SignalsMeta {
  stockCount: number;
  snapshotCount: number;
  eventCount: number;
  limitUpCount: number;
  run20Count: number;
  firstDate: string | null;
  lastDate: string | null;
  updatedAt: string | null;
}

export interface SignalsData {
  signals: SignalRow[];
  meta: SignalsMeta | null;
}

async function fetchSignals(): Promise<SignalsData> {
  const [sigRes, metaRes, run20Res] = await Promise.all([
    sb
      .from("research_signals")
      .select("*")
      .order("event_type", { ascending: true })
      .order("horizon", { ascending: true })
      .order("rank", { ascending: true }),
    sb.from("research_meta").select("*").eq("id", 1).limit(1),
    sb
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "run_20"),
  ]);

  const m = metaRes.data?.[0];
  return {
    signals: (sigRes.data ?? []) as SignalRow[],
    meta: m
      ? {
          stockCount: m.stock_count ?? 0,
          snapshotCount: m.snapshot_count ?? 0,
          eventCount: m.event_count ?? 0,
          limitUpCount: m.limit_up_count ?? 0,
          run20Count: run20Res.count ?? 0,
          firstDate: m.first_date ?? null,
          lastDate: m.last_date ?? null,
          updatedAt: m.updated_at ?? null,
        }
      : null,
  };
}

export const signalsQueryOptions = () =>
  queryOptions({
    queryKey: ["research-signals"],
    queryFn: fetchSignals,
    staleTime: 60_000,
  });

// ===== AI pattern discovery =====

export interface AiPatternRow {
  id: number;
  run_id: number | null;
  target_key: "lu" | "g10" | "g15" | "g20" | string;
  horizon: number;
  n_preds: number;
  pred_keys: string[];
  label: string;
  occurrences: number | null;
  successes: number | null;
  failures: number | null;
  precision_pct: number | null;
  recall_pct: number | null;
  fpr_pct: number | null;
  base_rate_pct: number | null;
  lift: number | null;
  avg_fwd: number | null;
  median_fwd: number | null;
  avg_days_to_target: number | null;
  z_score: number | null;
  p_value: number | null;
  ci_low: number | null;
  ci_high: number | null;
  significant: boolean | null;
  parent_precision: number | null;
  precision_gain: number | null;
  overfit: boolean | null;
  robust: boolean | null;
  rank: number | null;
}

export interface AiMetaRow {
  status: string | null;
  phase: string | null;
  last_run_at: string | null;
  matrix_rows: number | null;
  n_patterns: number | null;
  n_significant: number | null;
  updated_at: string | null;
}

export interface AiQualityRow {
  run_id: number | null;
  run_date: string | null;
  target_key: string;
  n_patterns: number | null;
  n_significant: number | null;
  top_precision: number | null;
  top_lift: number | null;
  best_label: string | null;
}

export interface AiPatternsData {
  patterns: AiPatternRow[];
  meta: AiMetaRow | null;
  quality: AiQualityRow[];
}

async function fetchAiPatterns(): Promise<AiPatternsData> {
  const [patRes, metaRes, qualRes] = await Promise.all([
    sb.from("ai_patterns").select("*").order("target_key", { ascending: true }).order("rank", { ascending: true }),
    sb.from("ai_meta").select("*").eq("id", 1).limit(1),
    sb.from("ai_signal_quality").select("*").order("run_date", { ascending: true }),
  ]);
  return {
    patterns: (patRes.data ?? []) as AiPatternRow[],
    meta: (metaRes.data?.[0] ?? null) as AiMetaRow | null,
    quality: (qualRes.data ?? []) as AiQualityRow[],
  };
}

export const aiPatternsQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-patterns"],
    queryFn: fetchAiPatterns,
    staleTime: 30_000,
  });

// ===== Data coverage =====

export interface CoverageReportRow {
  total_active: number | null;
  imported: number | null;
  missing: number | null;
  coverage_pct: number | null;
  missing_symbols: string[] | null;
  universe_source: string | null;
  generated_at: string | null;
}

export interface CoverageSymbolRow {
  symbol: string;
  company_name: string | null;
  in_universe: boolean | null;
  has_data: boolean | null;
  earliest_date: string | null;
  latest_date: string | null;
  n_days: number | null;
}

export interface CoverageData {
  report: CoverageReportRow | null;
  symbols: CoverageSymbolRow[];
}

async function fetchCoverage(): Promise<CoverageData> {
  const [repRes, symRes] = await Promise.all([
    sb.from("coverage_report").select("*").eq("id", 1).limit(1),
    sb.from("coverage_by_symbol").select("*").order("n_days", { ascending: true }),
  ]);
  return {
    report: (repRes.data?.[0] ?? null) as CoverageReportRow | null,
    symbols: (symRes.data ?? []) as CoverageSymbolRow[],
  };
}

export const coverageQueryOptions = () =>
  queryOptions({
    queryKey: ["coverage"],
    queryFn: fetchCoverage,
    staleTime: 60_000,
  });
