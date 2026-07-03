import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, RefreshCw, Radio, TrendingUp } from "lucide-react";

import { moversQueryOptions, type MoverQuote } from "@/lib/movers";
import { useMarketOpen } from "@/hooks/use-market-open";
import { fmtNum, fmtPct, fmtUpdatedTSI } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Poll roughly every minute while the exchange is open; Yahoo intraday data is
// ~15 min delayed, so a tighter interval adds no freshness.
const LIVE_REFRESH_MS = 60_000;

/** HH:mm:ss in Istanbul time from a unix (seconds) timestamp. */
function fmtRowTime(asOf: number | null): string {
  if (asOf == null) return "—";
  return new Date(asOf * 1000).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul",
  });
}

function MoverRow({ q, kind, idx }: { q: MoverQuote; kind: "up" | "down"; idx: number }) {
  const up = kind === "up";
  return (
    <Link
      to="/hisse/$symbol"
      params={{ symbol: q.symbol }}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-3 py-2.5 transition hover:bg-secondary/60",
        idx % 2 === 1 && "bg-secondary/20",
      )}
    >
      <div className="min-w-0">
        <span className="font-mono text-sm font-semibold text-foreground">{q.symbol}</span>
        <p className="truncate text-[11px] text-muted-foreground tabular">{fmtRowTime(q.asOf)}</p>
      </div>
      <span className="w-16 text-right font-mono text-sm text-foreground tabular">
        {fmtNum(q.price, 2)}
      </span>
      <span className="hidden w-16 text-right font-mono text-sm text-muted-foreground tabular sm:inline-block">
        {fmtNum(q.dayHigh, 2)}
      </span>
      <span
        className={cn(
          "inline-flex w-[76px] items-center justify-end gap-1 font-mono text-sm font-semibold tabular",
          up ? "text-success" : "text-destructive",
        )}
      >
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {fmtPct(q.changePct)}
      </span>
    </Link>
  );
}

function Column({
  title,
  kind,
  rows,
  loading,
}: {
  title: string;
  kind: "up" | "down";
  rows: MoverQuote[];
  loading: boolean;
}) {
  const up = kind === "up";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        {up ? (
          <ArrowUpRight className="h-4 w-4 text-success" />
        ) : (
          <ArrowDownRight className="h-4 w-4 text-destructive" />
        )}
        <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 border-b border-border bg-secondary/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Sembol</span>
        <span className="w-16 text-right">Son</span>
        <span className="hidden w-16 text-right sm:inline-block">Yüksek</span>
        <span className="w-[76px] text-right">%G</span>
      </div>
      {loading ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Veri yok</p>
      ) : (
        <div className="divide-y divide-border/50">
          {rows.map((q, idx) => (
            <MoverRow key={q.symbol} q={q} kind={kind} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MoversCard() {
  const marketOpen = useMarketOpen();
  const { data, isPending, isFetching, refetch } = useQuery({
    ...moversQueryOptions(),
    refetchInterval: marketOpen ? LIVE_REFRESH_MS : false,
    refetchOnWindowFocus: marketOpen,
  });

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Günün yükselen ve düşen hisseleri</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
              marketOpen
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-secondary/40 text-muted-foreground",
            )}
          >
            <Radio className={cn("h-3 w-3", marketOpen && "animate-pulse")} />
            {marketOpen ? "Canlı (≈15 dk gecikmeli)" : "Piyasa kapalı"}
          </span>
          {data?.asOf ? (
            <span>
              Son: <span className="font-medium text-foreground">{fmtUpdatedTSI(data.asOf)}</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
            title="Şimdi yenile"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            {isFetching ? "Yenileniyor" : "Yenile"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        En likit ~160 BIST hissesi arasında bugünün en çok yükselen ve düşenleri. Piyasa açıkken liste
        otomatik güncellenir. Yatırım tavsiyesi değildir.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Column title="En çok yükselenler" kind="up" rows={data?.gainers ?? []} loading={isPending} />
        <Column title="En çok düşenler" kind="down" rows={data?.losers ?? []} loading={isPending} />
      </div>
    </section>
  );
}
