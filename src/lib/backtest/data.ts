// Backtest data loader — pulls the raw history needed to replay the engine and
// shapes it into look-ahead-free `PreparedSymbol` records. Read-only: it never
// writes to the live tables and reuses the same `daily_snapshots` source the
// app already depends on.

import { supabase } from "@/integrations/supabase/client";
import { aiScore } from "@/lib/indicators";
import type { PreparedSymbol } from "./context";
import type { BacktestParams } from "./types";

const sb = supabase as unknown as { from: (table: string) => any };
const PAGE = 1000;

export interface LoadOptions {
  onProgress?: (loadedRows: number) => void;
  signal?: AbortSignal;
}

/** Subtract calendar days from an ISO date. */
function isoMinusDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Latest snapshot date in the DB (used as the default end date). */
export async function fetchLatestSnapshotDate(): Promise<string | null> {
  const res = await sb
    .from("daily_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  return res.data?.[0]?.snapshot_date ?? null;
}

async function fetchSnapshotsSince(since: string, opts: LoadOptions): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; ; i++) {
    if (opts.signal?.aborted) return rows;
    const res = await sb
      .from("daily_snapshots")
      .select(
        "symbol, snapshot_date, close, daily_return_pct, volume, vol_ratio_20d, market_value, daily_traded_value",
      )
      .gte("snapshot_date", since)
      .order("symbol", { ascending: true })
      .order("snapshot_date", { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1);
    const batch = res.data ?? [];
    rows.push(...batch);
    opts.onProgress?.(rows.length);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function fetchLegacyWatchlist(since: string, opts: LoadOptions): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; ; i++) {
    if (opts.signal?.aborted) return map;
    const res = await sb
      .from("ai_watchlist")
      .select("score_date, symbol, probability, matched_patterns, confidence, hist_success_pct")
      .gte("score_date", since)
      .order("score_date", { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1);
    const batch = res.data ?? [];
    for (const w of batch) {
      map.set(`${w.symbol}|${w.score_date}`, aiScore(w));
    }
    if (batch.length < PAGE) break;
  }
  return map;
}

/**
 * Load and prepare the universe for a backtest. Fetches enough history before
 * `startDate` to satisfy the warmup window, plus the evaluation range.
 */
export async function loadBacktestData(
  params: BacktestParams,
  opts: LoadOptions = {},
): Promise<PreparedSymbol[]> {
  // Enough calendar days to cover `warmup` trading sessions before startDate.
  const fetchSince = isoMinusDays(params.startDate, Math.ceil(params.warmup * 1.6) + 30);

  const [rows, legacyAll] = await Promise.all([
    fetchSnapshotsSince(fetchSince, opts),
    fetchLegacyWatchlist(fetchSince, opts),
  ]);

  // Market average daily return per date across the whole fetched set.
  const marketAgg = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.daily_return_pct == null) continue;
    const a = marketAgg.get(r.snapshot_date) ?? { sum: 0, n: 0 };
    a.sum += Number(r.daily_return_pct);
    a.n += 1;
    marketAgg.set(r.snapshot_date, a);
  }
  const marketByDate = new Map<string, number>();
  for (const [d, a] of marketAgg) marketByDate.set(d, a.n ? a.sum / a.n : 0);

  // Group rows by symbol (rows already sorted symbol, then date ascending).
  const bySymbol = new Map<string, PreparedSymbol>();
  for (const r of rows) {
    let s = bySymbol.get(r.symbol);
    if (!s) {
      s = {
        symbol: r.symbol,
        sector: null,
        dates: [],
        closes: [],
        rets: [],
        volumes: [],
        volRatio20d: [],
        tradedValue: [],
        marketValue: [],
        marketRets: [],
        legacyByDate: new Map(),
      };
      bySymbol.set(r.symbol, s);
    }
    s.dates.push(r.snapshot_date);
    s.closes.push(Number(r.close));
    s.rets.push(r.daily_return_pct == null ? 0 : Number(r.daily_return_pct));
    s.volumes.push(r.volume == null ? 0 : Number(r.volume));
    s.volRatio20d.push(r.vol_ratio_20d == null ? null : Number(r.vol_ratio_20d));
    s.tradedValue.push(r.daily_traded_value == null ? null : Number(r.daily_traded_value));
    s.marketValue.push(r.market_value == null ? null : Number(r.market_value));
    s.marketRets.push(marketByDate.get(r.snapshot_date) ?? 0);
    const legacy = legacyAll.get(`${r.symbol}|${r.snapshot_date}`);
    if (legacy != null) s.legacyByDate.set(r.snapshot_date, legacy);
  }

  return [...bySymbol.values()];
}
