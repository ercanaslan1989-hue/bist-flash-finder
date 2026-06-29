// Daily BIST ingestion: fetches the latest complete trading sessions from
// Yahoo Finance for every tracked symbol, computes the same derived metrics as
// the historical loader, upserts them into daily_snapshots, then refreshes
// events + the AI watchlist via ai_ingest_finalize().
//
// Designed to be safe to run repeatedly (idempotent upserts) and resumable:
// each run simply fills whatever trading days are missing per symbol.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Bar {
  d: string; // YYYY-MM-DD (UTC date of the bar, matches historical loader)
  close: number;
  vol: number;
}

// ---- Istanbul "today" + whether the current session has already closed ----
function istanbulParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = (parseInt(get("hour"), 10) || 0) * 60 + (parseInt(get("minute"), 10) || 0);
  return { date, minutes };
}

function isoDaysAgo(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function ret(closes: number[], i: number, n: number): number | null {
  if (i - n < 0) return null;
  const p = closes[i - n];
  if (!p) return null;
  return (closes[i] / p - 1) * 100;
}
function vr(vols: number[], i: number, n: number): number | null {
  if (i - n < 0) return null;
  const m = mean(vols.slice(i - n, i));
  if (!m) return null;
  return vols[i] / m;
}

async function fetchYahoo(symbol: string): Promise<Bar[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?range=3mo&interval=1d`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (r.status !== 200) {
        await new Promise((res) => setTimeout(res, 800));
        continue;
      }
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const ts: number[] | undefined = res?.timestamp;
      if (!ts) return [];
      const q = res.indicators.quote[0];
      const out: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = q.close[i];
        const v = q.volume[i];
        if (c == null || v == null) continue;
        const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
        out.push({ d, close: Number(c), vol: Number(v) });
      }
      return out;
    } catch (_e) {
      await new Promise((res) => setTimeout(res, 800));
    }
  }
  return null;
}

// Run async tasks with a bounded concurrency pool.
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      out[cur] = await fn(items[cur]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Latest stored snapshot date — used as a window anchor.
    const { data: latestRow } = await sb
      .from("daily_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1);
    const latest: string | undefined = latestRow?.[0]?.snapshot_date;
    if (!latest) {
      return new Response(JSON.stringify({ error: "no existing data" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Pull a trailing window (enough history for 20d/30d derived metrics).
    const since = isoDaysAgo(latest, 75);
    const PAGE = 1000;
    interface TailRow {
      symbol: string;
      snapshot_date: string;
      day_index: number | null;
      close: number;
      volume: number;
      market_value: number | null;
    }
    const tail: TailRow[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await sb
        .from("daily_snapshots")
        .select("symbol, snapshot_date, day_index, close, volume, market_value")
        .gte("snapshot_date", since)
        .order("symbol", { ascending: true })
        .order("snapshot_date", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      tail.push(...(data as TailRow[]));
      if (data.length < PAGE) break;
    }

    // Group tail per symbol (ascending).
    const bySymbol = new Map<string, TailRow[]>();
    for (const r of tail) {
      const arr = bySymbol.get(r.symbol) ?? [];
      arr.push(r);
      bySymbol.set(r.symbol, arr);
    }
    const symbols = [...bySymbol.keys()].sort();

    const { date: today, minutes } = istanbulParts();
    // Include today's session only once the market has closed (>= 18:15 TSI).
    const includeToday = minutes >= 18 * 60 + 15;

    // Fetch Yahoo for all symbols with bounded concurrency.
    const fetched = await pool(symbols, 8, (s) => fetchYahoo(s));
    const yMap = new Map<string, Bar[] | null>();
    symbols.forEach((s, i) => yMap.set(s, fetched[i]));
    const errors = symbols.filter((s) => yMap.get(s) === null);

    const rows: Record<string, unknown>[] = [];
    const updatedSymbols = new Set<string>();

    for (const sym of symbols) {
      const yd = yMap.get(sym);
      if (!yd || yd.length === 0) continue;
      const base = bySymbol.get(sym)!;
      const lastDate = base[base.length - 1].snapshot_date;
      const lastDayIdx = base[base.length - 1].day_index ?? base.length;
      const lastMv = base[base.length - 1].market_value;
      const lastClose = base[base.length - 1].close;
      const shares = lastMv && lastClose ? lastMv / lastClose : null;

      const closes = base.map((b) => Number(b.close));
      const vols = base.map((b) => Number(b.volume));

      // New complete sessions strictly after our last stored date.
      const adds = yd
        .filter((b) => b.d > lastDate && (includeToday ? b.d <= today : b.d < today))
        .sort((a, b) => (a.d < b.d ? -1 : 1));
      if (adds.length === 0) continue;

      let di = lastDayIdx;
      for (const b of adds) {
        closes.push(b.close);
        vols.push(b.vol);
        const i = closes.length - 1;
        di += 1;
        const dr = ret(closes, i, 1);
        const mv = shares ? shares * b.close : null;
        const round = (x: number | null, p: number) => (x == null ? null : Number(x.toFixed(p)));
        rows.push({
          snapshot_date: b.d,
          day_index: di,
          symbol: sym,
          close: round(b.close, 4),
          daily_return_pct: round(dr, 4),
          volume: b.vol,
          vol_ratio_20d: round(vr(vols, i, 20), 4),
          vol_ratio_2d: round(vr(vols, i, 2), 4),
          vol_ratio_3d: round(vr(vols, i, 3), 4),
          vol_ratio_1d: round(vr(vols, i, 1), 4),
          vol_ratio_5d: round(vr(vols, i, 5), 4),
          ret_5d: round(ret(closes, i, 5), 4),
          ret_10d: round(ret(closes, i, 10), 4),
          ret_20d: round(ret(closes, i, 20), 4),
          ret_30d: round(ret(closes, i, 30), 4),
          ret_2d: round(ret(closes, i, 2), 4),
          ret_3d: round(ret(closes, i, 3), 4),
          market_value: round(mv, 2),
          daily_traded_value: round(b.close * b.vol, 2),
          kap_count: 0,
        });
        updatedSymbols.add(sym);
      }
    }

    // Upsert new rows in chunks.
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb
        .from("daily_snapshots")
        .upsert(chunk, { onConflict: "snapshot_date,symbol", ignoreDuplicates: true });
      if (error) throw error;
      inserted += chunk.length;
    }

    // Recompute events + AI watchlist for the freshest data.
    let finalize: unknown = null;
    if (rows.length > 0) {
      const { data, error } = await sb.rpc("ai_ingest_finalize");
      if (error) throw error;
      finalize = data;
    }

    const { data: newLatest } = await sb
      .from("daily_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1);

    return new Response(
      JSON.stringify({
        ok: true,
        previous_latest: latest,
        latest_snapshot: newLatest?.[0]?.snapshot_date ?? latest,
        rows_inserted: inserted,
        symbols_updated: updatedSymbols.size,
        symbols_checked: symbols.length,
        fetch_errors: errors.length,
        include_today: includeToday,
        finalize,
        elapsed_ms: Date.now() - started,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
