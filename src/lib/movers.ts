import { queryOptions } from "@tanstack/react-query";

export interface MoverQuote {
  symbol: string;
  company_name: string | null;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number | null;
  asOf: number | null;
}

export interface MoversData {
  ok: boolean;
  asOf: string | null;
  scanned: number;
  gainers: MoverQuote[];
  losers: MoverQuote[];
}

async function fetchMovers(): Promise<MoversData> {
  const res = await fetch("/api/public/live-movers");
  if (!res.ok) throw new Error("Anlık veriler alınamadı");
  return (await res.json()) as MoversData;
}

export const moversQueryOptions = () =>
  queryOptions({
    queryKey: ["live-movers"],
    queryFn: fetchMovers,
    staleTime: 30_000,
  });
