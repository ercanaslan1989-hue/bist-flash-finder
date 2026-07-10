import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

import { KapCollector, type RawKapDisclosure, type KapDisclosure } from "./kap-collector";
import {
  NewsCollector,
  summarizeNews,
  type RawNews,
  type NewsItem,
  type NewsSentimentSummary,
} from "./news-collector";
import {
  MacroCollector,
  macroSnapshots,
  type RawMacro,
  type MacroSnapshot,
} from "./macro-collector";
import {
  SectorCollector,
  computeSectorStats,
  type RawSectorRow,
  type SectorStats,
} from "./sector-collector";
import {
  MarketBreadthCollector,
  computeBreadth,
  type RawBreadthRow,
  type MarketBreadth,
} from "./market-breadth-collector";
import { type CollectorResult } from "./types";

// Live data reader for the Market Intelligence dashboard. It reuses the same
// loosely-typed Supabase handle pattern as research.ts and feeds real rows
// through the deterministic collectors/analytics. No live source = graceful
// empty state (the collectors never throw).
const sb = supabase as unknown as { from: (table: string) => any };

/** Per-source data-quality summary derived from a collector run's provenance. */
export interface SourceQuality {
  id: string;
  label: string;
  count: number;
  /** 0-1 aggregate confidence (source reliability × completeness). */
  confidence: number;
  /** 0-1 mean field completeness. */
  completeness: number;
  /** Average age of the data in days (null when unknown). */
  ageDays: number | null;
  asOf: string | null;
  ok: boolean;
}

function qualityFrom<T>(label: string, r: CollectorResult<T>): SourceQuality {
  return {
    id: r.source,
    label,
    count: r.items.length,
    confidence: r.provenance.confidence,
    completeness: r.provenance.quality.completeness,
    ageDays: r.provenance.quality.ageDays,
    asOf: r.provenance.asOf,
    ok: r.ok,
  };
}

export interface MarketIntelData {
  kap: KapDisclosure[];
  news: NewsItem[];
  newsSummary: NewsSentimentSummary;
  macro: MacroSnapshot[];
  sectors: SectorStats[];
  breadth: MarketBreadth;
  quality: SourceQuality[];
  lastDate: string | null;
}

async function fetchMarketIntel(): Promise<MarketIntelData> {
  const lastRes = await sb
    .from("daily_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const lastDate: string | null = lastRes.data?.[0]?.snapshot_date ?? null;

  const [kapRes, newsRes, macroRes, snapRes] = await Promise.all([
    sb
      .from("kap_disclosures")
      .select("*")
      .order("disclosure_date", { ascending: false })
      .limit(100),
    sb
      .from("market_news")
      .select("id, symbol, source, title, body, url, published_at")
      .order("published_at", { ascending: false })
      .limit(100),
    sb
      .from("macro_indicators")
      .select("indicator, obs_date, value")
      .order("obs_date", { ascending: true })
      .limit(2000),
    lastDate
      ? sb
          .from("daily_snapshots")
          .select(
            "symbol, close, daily_return_pct, ret_5d, ret_20d, daily_traded_value, stocks(sector)",
          )
          .eq("snapshot_date", lastDate)
      : Promise.resolve({ data: [] }),
  ]);

  // ---- KAP ----
  const kapResult = await new KapCollector(
    async () => (kapRes.data ?? []) as RawKapDisclosure[],
  ).collect({}, { backoffMs: 0 });

  // ---- News ----
  const newsResult = await new NewsCollector(
    async () =>
      ((newsRes.data ?? []) as Array<Record<string, unknown>>).map(
        (n): RawNews => ({
          id: n.id as string,
          symbol: (n.symbol as string) ?? null,
          source: (n.source as string) ?? null,
          title: n.title as string,
          body: (n.body as string) ?? null,
          published_at: n.published_at as string,
          url: (n.url as string) ?? null,
        }),
      ),
  ).collect({}, { backoffMs: 0 });
  const news = newsResult.items.slice().reverse();
  const newsSummary = summarizeNews(newsResult.items);

  // ---- Macro ----
  const macroResult = await new MacroCollector(
    async () =>
      ((macroRes.data ?? []) as Array<Record<string, unknown>>).map(
        (m): RawMacro => ({
          indicator: m.indicator as string,
          date: (m.obs_date as string)?.slice(0, 10),
          value: m.value as number,
        }),
      ),
  ).collect({}, { backoffMs: 0 });
  const macro = macroSnapshots(macroResult.items);

  const snaps = (snapRes.data ?? []) as Array<{
    symbol: string;
    close: number | null;
    daily_return_pct: number | null;
    ret_5d: number | null;
    ret_20d: number | null;
    daily_traded_value: number | null;
    stocks: { sector: string } | null;
  }>;

  const sectorRows: RawSectorRow[] = snaps.map((s) => ({
    symbol: s.symbol,
    sector: s.stocks?.sector ?? null,
    date: lastDate ?? "",
    ret_1d: s.daily_return_pct,
    ret_5d: s.ret_5d,
    ret_20d: s.ret_20d,
    traded_value: s.daily_traded_value,
  }));
  const sectorResult = await new SectorCollector(async () => sectorRows).collect(
    {},
    { backoffMs: 0 },
  );
  const sectors = computeSectorStats(sectorResult.items);

  const breadthRows: RawBreadthRow[] = snaps.map((s) => ({
    symbol: s.symbol,
    date: lastDate ?? "",
    ret_1d: s.daily_return_pct,
    close: s.close,
  }));
  const breadthResult = await new MarketBreadthCollector(async () => breadthRows).collect(
    {},
    { backoffMs: 0 },
  );
  const breadth = computeBreadth(breadthResult.items);

  const quality: SourceQuality[] = [
    qualityFrom("KAP Bildirimleri", kapResult),
    qualityFrom("Haber Akışı", newsResult),
    qualityFrom("Makro Göstergeler", macroResult),
    qualityFrom("Sektör Verisi", sectorResult),
    qualityFrom("Piyasa Genişliği", breadthResult),
  ];

  return {
    kap: kapResult.items.slice().reverse(),
    news,
    newsSummary,
    macro,
    sectors,
    breadth,
    quality,
    lastDate,
  };
}

export const marketIntelQueryOptions = () =>
  queryOptions({
    queryKey: ["market-intel"],
    queryFn: fetchMarketIntel,
    staleTime: 60_000,
  });
