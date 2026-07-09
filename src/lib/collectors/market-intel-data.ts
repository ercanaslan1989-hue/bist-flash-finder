import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

import { KapCollector, type RawKapDisclosure, type KapDisclosure } from "./kap-collector";
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

// Live data reader for the Market Intelligence dashboard. It reuses the same
// loosely-typed Supabase handle pattern as research.ts and feeds real rows
// through the deterministic collectors/analytics. No live source = graceful
// empty state (the collectors never throw).
const sb = supabase as unknown as { from: (table: string) => any };

export interface MarketIntelData {
  kap: KapDisclosure[];
  sectors: SectorStats[];
  breadth: MarketBreadth;
  lastDate: string | null;
}

async function fetchMarketIntel(): Promise<MarketIntelData> {
  const lastRes = await sb
    .from("daily_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const lastDate: string | null = lastRes.data?.[0]?.snapshot_date ?? null;

  const [kapRes, snapRes] = await Promise.all([
    sb
      .from("kap_disclosures")
      .select("*")
      .order("disclosure_date", { ascending: false })
      .limit(100),
    lastDate
      ? sb
          .from("daily_snapshots")
          .select(
            "symbol, close, daily_return_pct, ret_5d, ret_20d, daily_traded_value, stocks(sector)",
          )
          .eq("snapshot_date", lastDate)
      : Promise.resolve({ data: [] }),
  ]);

  const kapResult = await new KapCollector(
    async () => (kapRes.data ?? []) as RawKapDisclosure[],
  ).collect({}, { backoffMs: 0 });

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

  return { kap: kapResult.items.slice().reverse(), sectors, breadth, lastDate };
}

export const marketIntelQueryOptions = () =>
  queryOptions({
    queryKey: ["market-intel"],
    queryFn: fetchMarketIntel,
    staleTime: 60_000,
  });
