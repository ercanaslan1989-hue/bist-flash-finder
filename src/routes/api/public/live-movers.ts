import { createFileRoute } from "@tanstack/react-router";

// Live (≈15 min delayed) BIST movers — today's top gainers and losers.
//
// Source: Yahoo Finance v8 chart endpoint, which returns real intraday
// `regularMarketPrice` + `chartPreviousClose` per ticker (currency TRY) and
// works from the Cloudflare Worker runtime via plain fetch. The v7 multi-quote
// endpoint is now blocked ("Unauthorized"), so we fan out per symbol over the
// most liquid slice of the universe.
//
// Results are cached in-worker for a short TTL so repeated client polls don't
// re-hammer Yahoo. The client polls this route while the market is open.

const UNIVERSE = 160; // most liquid symbols scanned each refresh
const CONCURRENCY = 12;
const CACHE_TTL_MS = 45_000;
const TOP_N = 30;

type Quote = {
  symbol: string;
  company_name: string | null;
  price: number;
  prevClose: number;
  changePct: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  asOf: number | null;
};

type MoversPayload = {
  ok: true;
  asOf: string | null;
  scanned: number;
  gainers: Quote[];
  losers: Quote[];
};

let cache: { at: number; payload: MoversPayload } | null = null;

type YahooChart = {
  chart: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number | null;
        chartPreviousClose?: number | null;
        previousClose?: number | null;
        regularMarketDayHigh?: number | null;
        regularMarketDayLow?: number | null;
        regularMarketVolume?: number | null;
        regularMarketTime?: number | null;
      };
    }>;
  };
};

async function fetchQuote(
  symbol: string,
  companyName: string | null,
): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}.IS?range=2d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BistSinyal/1.0)" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as YahooChart;
  const m = data.chart?.result?.[0]?.meta;
  if (!m) return null;
  const price = m.regularMarketPrice ?? null;
  const prevClose = m.chartPreviousClose ?? m.previousClose ?? null;
  if (price == null || prevClose == null || prevClose === 0) return null;
  const changePct = (price / prevClose - 1) * 100;
  if (!Number.isFinite(changePct)) return null;
  return {
    symbol,
    company_name: companyName,
    price,
    prevClose,
    changePct,
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    volume: m.regularMarketVolume ?? null,
    asOf: m.regularMarketTime ?? null,
  };
}

export const Route = createFileRoute("/api/public/live-movers")({
  server: {
    handlers: {
      GET: async () => {
        const now = Date.now();
        if (cache && now - cache.at < CACHE_TTL_MS) {
          return Response.json(cache.payload, {
            headers: { "Cache-Control": "public, max-age=30" },
          });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Most recent snapshot date, then the most liquid symbols on that day.
        const lastRes = await supabaseAdmin
          .from("daily_snapshots")
          .select("snapshot_date")
          .order("snapshot_date", { ascending: false })
          .limit(1);
        const latest = lastRes.data?.[0]?.snapshot_date;
        if (!latest) {
          return Response.json(
            { ok: true, asOf: null, scanned: 0, gainers: [], losers: [] },
            { status: 200 },
          );
        }

        const [snapRes, stocksRes] = await Promise.all([
          supabaseAdmin
            .from("daily_snapshots")
            .select("symbol, daily_traded_value")
            .eq("snapshot_date", latest)
            .order("daily_traded_value", { ascending: false, nullsFirst: false })
            .limit(UNIVERSE),
          supabaseAdmin.from("stocks").select("symbol, company_name"),
        ]);

        const nameMap = new Map<string, string | null>(
          (stocksRes.data ?? []).map((s) => [s.symbol as string, s.company_name as string | null]),
        );
        const symbols = (snapRes.data ?? []).map((r) => r.symbol as string);

        const quotes: Quote[] = [];
        for (let i = 0; i < symbols.length; i += CONCURRENCY) {
          const batch = symbols.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (sym) => {
              try {
                return await fetchQuote(sym, nameMap.get(sym) ?? null);
              } catch {
                return null;
              }
            }),
          );
          for (const q of results) if (q) quotes.push(q);
        }

        const asOfTs = quotes.reduce<number | null>((max, q) => {
          if (q.asOf == null) return max;
          return max == null || q.asOf > max ? q.asOf : max;
        }, null);

        const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
        const gainers = sorted.filter((q) => q.changePct > 0).slice(0, TOP_N);
        const losers = sorted
          .filter((q) => q.changePct < 0)
          .slice(-TOP_N)
          .reverse();

        const payload: MoversPayload = {
          ok: true,
          asOf: asOfTs != null ? new Date(asOfTs * 1000).toISOString() : null,
          scanned: quotes.length,
          gainers,
          losers,
        };
        cache = { at: now, payload };

        return Response.json(payload, {
          headers: { "Cache-Control": "public, max-age=30" },
        });
      },
    },
  },
});
