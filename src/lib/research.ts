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
    // Curated, frozen v1.0 Top-100 patterns (overfit/robust flagged).
    sb.from("ai_top_patterns").select("*").order("rank", { ascending: true }),
    sb.from("ai_meta").select("*").eq("id", 1).limit(1),
    sb.from("ai_signal_quality").select("*").order("run_date", { ascending: true }),
  ]);
  const patterns = ((patRes.data ?? []) as AiPatternRow[]).map((p) => ({
    ...p,
    // ai_top_patterns has no `significant` column; a robust (non-overfit) row is significant.
    significant: p.robust ?? (p.overfit == null ? true : !p.overfit),
  }));
  return {
    patterns,
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

// ===== Engine version (v1.0 freeze) =====

export interface EngineVersionRow {
  version: string | null;
  frozen: boolean | null;
  frozen_at: string | null;
  stages: string | null;
  notes: string | null;
}

async function fetchEngineVersion(): Promise<EngineVersionRow | null> {
  const res = await sb
    .from("ai_engine_version")
    .select("*")
    .order("frozen_at", { ascending: false })
    .limit(1);
  return (res.data?.[0] ?? null) as EngineVersionRow | null;
}

// ===== Top-20 validated signals (ai_top_signals) =====

export interface TopSignalRow {
  id: number;
  rank: number | null;
  target_key: string;
  horizon: number;
  label: string;
  pred_keys: string[];
  occurrences: number | null;
  precision_pct: number | null;
  lift: number | null;
  ci_low: number | null;
  z_score: number | null;
  confidence: number | null;
}

export interface TopSignalsData {
  signals: TopSignalRow[];
  meta: SignalsMeta | null;
  version: EngineVersionRow | null;
}

async function fetchTopSignals(): Promise<TopSignalsData> {
  const [sigRes, metaRes, run20Res, versionRes] = await Promise.all([
    sb.from("ai_top_signals").select("*").order("rank", { ascending: true }),
    sb.from("research_meta").select("*").eq("id", 1).limit(1),
    sb.from("events").select("id", { count: "exact", head: true }).eq("event_type", "run_20"),
    fetchEngineVersion(),
  ]);
  const m = metaRes.data?.[0];
  return {
    signals: (sigRes.data ?? []) as TopSignalRow[],
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
    version: versionRes,
  };
}

export const topSignalsQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-top-signals"],
    queryFn: fetchTopSignals,
    staleTime: 60_000,
  });

// ===== Daily AI watchlist (ai_watchlist) =====

export interface WatchlistRow {
  id: number;
  score_date: string;
  symbol: string;
  company_name: string | null;
  sector: string | null;
  probability: number | null;
  confidence: number | null;
  matched_patterns: number | null;
  matched_labels: string[] | null;
  best_target: string | null;
  hist_success_pct: number | null;
  rank: number | null;
  updated_at: string | null;
}

export interface WatchlistData {
  rows: WatchlistRow[];
  scoreDate: string | null;
  total: number;
  elevated: number;
}

async function fetchWatchlist(): Promise<WatchlistData> {
  const lastRes = await sb
    .from("ai_watchlist")
    .select("score_date")
    .order("score_date", { ascending: false })
    .limit(1);
  const scoreDate: string | undefined = lastRes.data?.[0]?.score_date;
  if (!scoreDate) return { rows: [], scoreDate: null, total: 0, elevated: 0 };

  const res = await sb
    .from("ai_watchlist")
    .select("*")
    .eq("score_date", scoreDate)
    .order("rank", { ascending: true });
  const rows = (res.data ?? []) as WatchlistRow[];
  return {
    rows,
    scoreDate,
    total: rows.length,
    elevated: rows.filter((r) => (r.matched_patterns ?? 0) > 0).length,
  };
}

export const watchlistQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-watchlist"],
    queryFn: fetchWatchlist,
    staleTime: 60_000,
  });

// ===== Feature importance (ai_feature_importance) =====

export interface FeatureImportanceRow {
  id: number;
  target_key: string;
  pred_key: string;
  label: string;
  feature_group: string | null;
  appearances: number | null;
  avg_precision: number | null;
  avg_lift: number | null;
  best_precision: number | null;
  importance: number | null;
  rank: number | null;
}

async function fetchFeatureImportance(): Promise<FeatureImportanceRow[]> {
  const res = await sb
    .from("ai_feature_importance")
    .select("*")
    .order("rank", { ascending: true });
  return (res.data ?? []) as FeatureImportanceRow[];
}

export const featureImportanceQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-feature-importance"],
    queryFn: fetchFeatureImportance,
    staleTime: 60_000,
  });

// ===== Monthly backtest + walk-forward (ai_backtest_monthly / ai_walkforward_*) =====

export interface BacktestMonthRow {
  id: number;
  month: string;
  target_key: string;
  occurrences: number | null;
  successes: number | null;
  precision_pct: number | null;
}

export interface WalkforwardMonthRow {
  id: number;
  month: string;
  n_signals: number | null;
  precision_pct: number | null;
  avg_fwd_return: number | null;
  hit_rate_pos: number | null;
}

export interface WalkforwardSummaryRow {
  total_signals: number | null;
  overall_precision: number | null;
  avg_monthly_precision: number | null;
  best_month: string | null;
  best_month_precision: number | null;
  worst_month: string | null;
  worst_month_precision: number | null;
  avg_fwd_return: number | null;
  hit_rate: number | null;
  calib_low_pred: number | null;
  calib_low_actual: number | null;
  calib_high_pred: number | null;
  calib_high_actual: number | null;
}

export interface BacktestData {
  monthly: BacktestMonthRow[];
  walkforward: WalkforwardMonthRow[];
  summary: WalkforwardSummaryRow | null;
}

async function fetchBacktest(): Promise<BacktestData> {
  const [bRes, wRes, sRes] = await Promise.all([
    sb.from("ai_backtest_monthly").select("*").order("month", { ascending: true }),
    sb.from("ai_walkforward_monthly").select("*").order("month", { ascending: true }),
    sb.from("ai_walkforward_summary").select("*").eq("id", 1).limit(1),
  ]);
  return {
    monthly: (bRes.data ?? []) as BacktestMonthRow[],
    walkforward: (wRes.data ?? []) as WalkforwardMonthRow[],
    summary: (sRes.data?.[0] ?? null) as WalkforwardSummaryRow | null,
  };
}

export const backtestQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-backtest"],
    queryFn: fetchBacktest,
    staleTime: 60_000,
  });

// ===== Out-of-sample validation (ai_oos_validation) =====

export interface OosRow {
  id: number;
  target_key: string;
  in_sample_precision: number | null;
  oos_precision: number | null;
  in_sample_n: number | null;
  oos_n: number | null;
  train_period: string | null;
  test_period: string | null;
  note: string | null;
}

export interface OosData {
  rows: OosRow[];
  version: EngineVersionRow | null;
}

async function fetchOos(): Promise<OosData> {
  const [oosRes, versionRes] = await Promise.all([
    sb.from("ai_oos_validation").select("*").order("target_key", { ascending: true }),
    fetchEngineVersion(),
  ]);
  return {
    rows: (oosRes.data ?? []) as OosRow[],
    version: versionRes,
  };
}

export const oosQueryOptions = () =>
  queryOptions({
    queryKey: ["ai-oos"],
    queryFn: fetchOos,
    staleTime: 60_000,
  });
