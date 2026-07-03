import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
import {
  aiScore,
  beta as calcBeta,
  rsi,
  macd,
  volatility,
  stabilityScore,
  blendedScore,
  obvTrend,
  relativeStrength,
  liquidityTier,
  type MacdStatus,
  type ObvTrend,
  type LiquidityLevel,
} from "@/lib/indicators";
import type { WatchlistRow, AiPatternRow } from "@/lib/research";

const sb = supabase as unknown as { from: (table: string) => any };

const PAGE = 1000;
const HISTORY_DAYS = 60; // calendar days → ~40 trading rows per symbol

// ===== Shared recent price history (cached, used by list + detail) =====

export interface SymbolSeries {
  dates: string[];
  closes: number[];
  rets: number[];
  volumes: number[];
}

export interface RecentHistory {
  bySymbol: Map<string, SymbolSeries>;
  marketDates: string[];
  marketRet: number[];
  latestDate: string | null;
}

function isoDaysAgo(latest: string, days: number): string {
  const d = new Date(latest);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchRecentHistory(): Promise<RecentHistory> {
  const lastRes = await sb
    .from("daily_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const latest: string | undefined = lastRes.data?.[0]?.snapshot_date;
  if (!latest) return { bySymbol: new Map(), marketDates: [], marketRet: [], latestDate: null };

  const since = isoDaysAgo(latest, HISTORY_DAYS);
  const countRes = await sb
    .from("daily_snapshots")
    .select("id", { count: "exact", head: true })
    .gte("snapshot_date", since);
  const total: number = countRes.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const reqs = [];
  for (let i = 0; i < pages; i++) {
    reqs.push(
      sb
        .from("daily_snapshots")
        .select("symbol, snapshot_date, close, daily_return_pct")
        .gte("snapshot_date", since)
        .order("symbol", { ascending: true })
        .order("snapshot_date", { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1),
    );
  }
  const results = await Promise.all(reqs);
  const rows: { symbol: string; snapshot_date: string; close: number; daily_return_pct: number | null }[] =
    results.flatMap((r) => r.data ?? []);

  const bySymbol = new Map<string, SymbolSeries>();
  const retByDate = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    let s = bySymbol.get(row.symbol);
    if (!s) {
      s = { dates: [], closes: [], rets: [] };
      bySymbol.set(row.symbol, s);
    }
    s.dates.push(row.snapshot_date);
    s.closes.push(Number(row.close));
    const ret = row.daily_return_pct == null ? 0 : Number(row.daily_return_pct);
    s.rets.push(ret);
    if (row.daily_return_pct != null) {
      const agg = retByDate.get(row.snapshot_date) ?? { sum: 0, n: 0 };
      agg.sum += ret;
      agg.n += 1;
      retByDate.set(row.snapshot_date, agg);
    }
  }
  const marketDates = [...retByDate.keys()].sort();
  const marketRet = marketDates.map((d) => {
    const a = retByDate.get(d)!;
    return a.n ? a.sum / a.n : 0;
  });

  return { bySymbol, marketDates, marketRet, latestDate: latest };
}

export const recentHistoryQueryOptions = () =>
  queryOptions({
    queryKey: ["recent-history"],
    queryFn: fetchRecentHistory,
    staleTime: 5 * 60_000,
  });

// ===== Daily opportunities (watchlist + latest snapshot + indicators) =====

export interface OpportunityRow {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  aiScore: number;
  confidence: number | null;
  probability: number | null;
  matchedPatterns: number;
  bestTarget: string | null;
  histSuccess: number | null;
  close: number | null;
  dailyReturn: number | null;
  volumeIncrease: number | null; // % vs 20d avg
  marketCap: number | null;
  rsi: number | null;
  macdStatus: MacdStatus;
  volatility: number | null;
  ret5d: number | null; // accumulated % over last ~5 sessions
  ret20d: number | null; // accumulated % over last ~20 sessions
  stability: number; // 0-100 durability of the setup
  blended: number; // AI signal discounted by stability (default ranking)
  updatedAt: string | null;
}

export interface OpportunitiesData {
  rows: OpportunityRow[];
  scoreDate: string | null;
  latestDate: string | null;
  /** Most recent updated_at timestamp across the scored rows. */
  updatedAt: string | null;
  sectors: string[];
}

/** Sum of the last `n` daily returns (already in percent). */
function recentSum(rets: number[], n: number): number | null {
  if (!rets.length) return null;
  return rets.slice(-n).reduce((a, b) => a + b, 0);
}

async function fetchOpportunities(): Promise<OpportunitiesData> {
  const wlDateRes = await sb
    .from("ai_watchlist")
    .select("score_date")
    .order("score_date", { ascending: false })
    .limit(1);
  const scoreDate: string | undefined = wlDateRes.data?.[0]?.score_date;

  const [wlRes, history] = await Promise.all([
    scoreDate
      ? sb.from("ai_watchlist").select("*").eq("score_date", scoreDate)
      : Promise.resolve({ data: [] }),
    fetchRecentHistory(),
  ]);
  const wl = (wlRes.data ?? []) as WatchlistRow[];

  // Latest snapshot metrics for each symbol.
  const latest = history.latestDate;
  let snapRows: any[] = [];
  if (latest) {
    const snapRes = await sb
      .from("daily_snapshots")
      .select("symbol, close, daily_return_pct, vol_ratio_20d, market_value")
      .eq("snapshot_date", latest);
    snapRows = snapRes.data ?? [];
  }
  const snapMap = new Map<string, any>(snapRows.map((r) => [r.symbol, r]));

  const rows: OpportunityRow[] = wl.map((w) => {
    const snap = snapMap.get(w.symbol);
    const series = history.bySymbol.get(w.symbol);
    const closes = series?.closes ?? [];
    const m = macd(closes);
    const ai = aiScore(w);
    const vol = series ? volatility(series.rets) : null;
    const rsiVal = rsi(closes);
    const ret5d = series ? recentSum(series.rets, 5) : null;
    const ret20d = series ? recentSum(series.rets, 20) : null;
    const dailyReturn = snap?.daily_return_pct != null ? Number(snap.daily_return_pct) : null;
    const stability = stabilityScore({
      rsi: rsiVal,
      ret5d,
      ret20d,
      macdStatus: m.status,
      volatility: vol,
      dailyReturn,
    });
    return {
      symbol: w.symbol,
      company_name: w.company_name,
      sector: w.sector,
      aiScore: ai,
      confidence: w.confidence,
      probability: w.probability,
      matchedPatterns: w.matched_patterns ?? 0,
      bestTarget: w.best_target,
      histSuccess: w.hist_success_pct,
      close: snap ? Number(snap.close) : (closes[closes.length - 1] ?? null),
      dailyReturn,
      volumeIncrease:
        snap?.vol_ratio_20d != null ? (Number(snap.vol_ratio_20d) - 1) * 100 : null,
      marketCap: snap?.market_value != null ? Number(snap.market_value) : null,
      rsi: rsiVal,
      macdStatus: m.status,
      volatility: vol,
      ret5d,
      ret20d,
      stability,
      blended: blendedScore(ai, stability),
      updatedAt: w.updated_at ?? null,
    };
  });

  // Default ranking now favours durable setups over exhausted momentum spikes.
  rows.sort((a, b) => b.blended - a.blended);
  const sectors = [...new Set(rows.map((r) => r.sector).filter(Boolean) as string[])].sort();
  const updatedAt = wl.reduce<string | null>((max, w) => {
    const u = w.updated_at ?? null;
    if (!u) return max;
    return !max || u > max ? u : max;
  }, null);
  return { rows, scoreDate: scoreDate ?? null, latestDate: latest, updatedAt, sectors };
}

export const opportunitiesQueryOptions = () =>
  queryOptions({
    queryKey: ["opportunities"],
    queryFn: fetchOpportunities,
    staleTime: 5 * 60_000,
  });

// ===== Single stock detail =====

export interface StockPattern {
  label: string;
  target_key: string;
  horizon: number;
  precision_pct: number | null;
  lift: number | null;
  occurrences: number | null;
}

export interface StockDetailData {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  watchlist: WatchlistRow | null;
  aiScore: number;
  history: { dates: string[]; closes: number[]; volumes: number[] };
  recentRets: number[];
  marketRet: number[];
  patterns: StockPattern[];
  latestDate: string | null;
}

async function fetchStockDetail(symbol: string): Promise<StockDetailData> {
  const sym = symbol.toUpperCase();
  const [stockRes, wlRes, histRes, patRes, recent] = await Promise.all([
    sb.from("stocks").select("symbol, company_name, sector").eq("symbol", sym).limit(1),
    sb
      .from("ai_watchlist")
      .select("*")
      .eq("symbol", sym)
      .order("score_date", { ascending: false })
      .limit(1),
    sb
      .from("daily_snapshots")
      .select("snapshot_date, close, volume, daily_return_pct")
      .eq("symbol", sym)
      .order("snapshot_date", { ascending: false })
      .limit(260),
    sb.from("ai_top_patterns").select("*"),
    fetchRecentHistory(),
  ]);

  const stock = stockRes.data?.[0] ?? null;
  const watchlist = (wlRes.data?.[0] ?? null) as WatchlistRow | null;
  const histAsc = ((histRes.data ?? []) as any[]).slice().reverse();
  const dates = histAsc.map((r) => r.snapshot_date as string);
  const closes = histAsc.map((r) => Number(r.close));
  const volumes = histAsc.map((r) => Number(r.volume));
  const recentRets = histAsc.map((r) => (r.daily_return_pct == null ? 0 : Number(r.daily_return_pct)));

  const allPatterns = (patRes.data ?? []) as AiPatternRow[];
  const labels = new Set(watchlist?.matched_labels ?? []);
  const patterns: StockPattern[] = allPatterns
    .filter((p) => labels.has(p.label))
    .map((p) => ({
      label: p.label,
      target_key: p.target_key,
      horizon: p.horizon,
      precision_pct: p.precision_pct,
      lift: p.lift,
      occurrences: p.occurrences,
    }))
    .sort((a, b) => (b.precision_pct ?? 0) - (a.precision_pct ?? 0));

  return {
    symbol: sym,
    company_name: stock?.company_name ?? watchlist?.company_name ?? null,
    sector: stock?.sector ?? watchlist?.sector ?? null,
    watchlist,
    aiScore: watchlist ? aiScore(watchlist) : 0,
    history: { dates, closes, volumes },
    recentRets,
    marketRet: recent.marketRet,
    patterns,
    latestDate: recent.latestDate,
  };
}

export function stockDetailQueryOptions(symbol: string) {
  return queryOptions({
    queryKey: ["stock-detail", symbol.toUpperCase()],
    queryFn: () => fetchStockDetail(symbol),
    staleTime: 5 * 60_000,
  });
}

// Re-export for convenience
export { calcBeta };
