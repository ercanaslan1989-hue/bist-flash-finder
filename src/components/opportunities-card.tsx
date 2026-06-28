import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, RefreshCw, Radio, AlertTriangle } from "lucide-react";

import { opportunitiesQueryOptions } from "@/lib/opportunities";
import { OpportunityTable } from "@/components/opportunity-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketOpen, REFRESH_MS } from "@/hooks/use-market-open";
import { fmtDateTime, fmtDateShort, isStaleDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OpportunitiesCard({ limit = 12 }: { limit?: number }) {
  const marketOpen = useMarketOpen();
  const { data, isPending, isFetching } = useQuery({
    ...opportunitiesQueryOptions(),
    refetchInterval: marketOpen ? REFRESH_MS : false,
    refetchOnWindowFocus: marketOpen,
  });

  const stale = isStaleDate(data?.latestDate);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Bugünün en güçlü fırsatları</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {stale ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 font-medium text-warning">
              <AlertTriangle className="h-3 w-3" />
              Veri güncel değil (son veri: {fmtDateShort(data?.latestDate)})
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                marketOpen
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-secondary/40 text-muted-foreground",
              )}
            >
              <Radio className="h-3 w-3" />
              {marketOpen ? "Piyasa açık · 5 dk'da bir canlı" : "Piyasa kapalı"}
            </span>
          )}
          {isFetching && !isPending ? (
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Güncelleniyor
            </span>
          ) : data?.updatedAt ? (
            <span>Son güncelleme: {fmtDateTime(data.updatedAt)}</span>
          ) : null}
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
