import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, RefreshCw, Radio, CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";

import { opportunitiesQueryOptions } from "@/lib/opportunities";
import { OpportunityTable } from "@/components/opportunity-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketOpen, REFRESH_MS } from "@/hooks/use-market-open";
import { fmtUpdatedTSI, dataFreshness } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OpportunitiesCard({ limit = 12 }: { limit?: number }) {
  const marketOpen = useMarketOpen();
  const { data, isPending, isFetching, refetch } = useQuery({
    ...opportunitiesQueryOptions(),
    refetchInterval: marketOpen ? REFRESH_MS : false,
    refetchOnWindowFocus: marketOpen,
  });

  const fresh = dataFreshness(data?.latestDate);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Bugünün en güçlü fırsatları</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {fresh.tier === "critical" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
              <AlertOctagon className="h-3 w-3" />
              {fresh.label}
            </span>
          ) : fresh.tier === "warn" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 font-medium text-warning">
              <AlertTriangle className="h-3 w-3" />
              {fresh.label}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 font-medium text-success">
              <CheckCircle2 className="h-3 w-3" />
              Veriler güncel
            </span>
          )}

          {/* Market status is informational only — data is collected once daily
              after close, so we never claim a live intraday feed. */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 font-medium text-muted-foreground">
            <Radio className="h-3 w-3" />
            {marketOpen ? "Piyasa açık" : "Piyasa kapalı"}
          </span>


          {data?.updatedAt ? (
            <span className="text-muted-foreground">
              Son güncelleme: <span className="font-medium text-foreground">{fmtUpdatedTSI(data.updatedAt)}</span>
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
            title="En son veriyi kontrol et"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            {isFetching ? "Yenileniyor" : "Yenile"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Dondurulmuş v1.0 motorunun günlük puanlarına göre AI skoru en yüksek hisseler. Yatırım tavsiyesi değildir.
      </p>

      {isPending ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <OpportunityTable rows={(data?.rows ?? []).slice(0, limit)} />
          <div className="mt-3 flex justify-end">
            <Link
              to="/firsatlar"
              className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Tüm fırsatları ve filtreleri gör →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
