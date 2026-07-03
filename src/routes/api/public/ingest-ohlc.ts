import { createFileRoute } from "@tanstack/react-router";

// Yahoo Finance chart API — free source that provides real OHLC + adjusted close
// for BIST tickers (symbol + ".IS", currency TRY). Verified working from the
// Cloudflare Worker runtime via plain fetch.
//
// This endpoint backfills the open/high/low/adj_close columns on
// public.daily_snapshots that the external EOD pipeline does not provide.
//
// Batched: call repeatedly with ?offset=0&limit=40&days=10 until "done": true.
// Auth: send the project's anon/publishable key in the `apikey` header.

type YahooChart = {
  chart: {
    result?: Array<{
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: unknown;
  };
};

type OhlcRow = {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  adj_close: number | null;
};

function toDateStr(ts: number): string {
  // Yahoo daily timestamps are seconds at market open; use UTC date.
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function fetchYahooOhlc(symbol: string, days: number): Promise<OhlcRow[]> {
  const range = `${Math.max(days, 5)}d`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}.IS?range=${range}&interval=1d&events=div%2Csplit`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BistFlashFinder/1.0)" },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as YahooChart;
  const result = data.chart?.result?.[0];
  if (!result || !result.timestamp) return [];

  const q = result.indicators.quote?.[0] ?? {};
  const adj = result.indicators.adjclose?.[0]?.adjclose;
  const rows: OhlcRow[] = [];

  for (let i = 0; i < result.timestamp.length; i++) {
    const open = q.open?.[i] ?? null;
    const high = q.high?.[i] ?? null;
    const low = q.low?.[i] ?? null;
    const adjClose = adj?.[i] ?? null;
    if (open == null && high == null && low == null && adjClose == null) continue;
    rows.push({
      symbol,
      date: toDateStr(result.timestamp[i]),
      open,
      high,
      low,
      adj_close: adjClose,
    });
  }
  return rows;
}

export const Route = createFileRoute("/api/public/ingest-ohlc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const anonKey =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        const provided =
          request.headers.get("apikey") ||
          request.headers.get("x-api-key") ||
          "";
        if (!anonKey || provided !== anonKey) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const u = new URL(request.url);
        const offset = Math.max(0, Number(u.searchParams.get("offset") ?? "0") || 0);
        const limit = Math.min(
          60,
          Math.max(1, Number(u.searchParams.get("limit") ?? "40") || 40),
        );
        const days = Math.min(
          365,
          Math.max(5, Number(u.searchParams.get("days") ?? "10") || 10),
        );

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const { data: stocks, error: stocksErr } = await supabaseAdmin
          .from("stocks")
          .select("symbol")
          .order("symbol", { ascending: true })
          .range(offset, offset + limit - 1);

        if (stocksErr) {
          return new Response(
            JSON.stringify({ error: stocksErr.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const symbols = (stocks ?? []).map((s) => s.symbol as string);
        const allRows: OhlcRow[] = [];
        let failed = 0;

        // Small concurrency to stay within Worker limits and be polite to Yahoo.
        const CONCURRENCY = 6;
        for (let i = 0; i < symbols.length; i += CONCURRENCY) {
          const batch = symbols.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (sym) => {
              try {
                return await fetchYahooOhlc(sym, days);
              } catch {
                failed++;
                return [] as OhlcRow[];
              }
            }),
          );
          for (const r of results) allRows.push(...r);
        }

        let updated = 0;
        if (allRows.length > 0) {
          const { data: upd, error: rpcErr } = await supabaseAdmin.rpc(
            "apply_ohlc",
            { rows: allRows },
          );
          if (rpcErr) {
            return new Response(
              JSON.stringify({ error: rpcErr.message, fetched: allRows.length }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          updated = (upd as number) ?? 0;
        }

        const processed = symbols.length;
        const done = processed < limit;
        return new Response(
          JSON.stringify({
            ok: true,
            offset,
            limit,
            days,
            symbols: processed,
            fetchedRows: allRows.length,
            updatedRows: updated,
            failedSymbols: failed,
            nextOffset: done ? null : offset + limit,
            done,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
