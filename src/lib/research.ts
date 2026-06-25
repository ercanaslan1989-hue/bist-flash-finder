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
