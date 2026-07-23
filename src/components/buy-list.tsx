import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Flame, Check, ArrowRight, RefreshCw } from "lucide-react";
import { opportunitiesQueryOptions, type OpportunityRow } from "@/lib/opportunities";
import { addHolding, isHeld } from "@/lib/portfolio";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketOpen, REFRESH_MS } from "@/hooks/use-market-open";
import { fmtUpdatedTSI } from "@/lib/format";
import { cn } from "@/lib/utils";

// Bu haftaya odaklı: sadece güven skoru yüksek, likit hisseler.
// Hedef %10-20 (mid-point tabanlı). Auto-tuner min_confidence'ı ayarlar.
function pickBuyList(rows: OpportunityRow[], minConfidence: number): (OpportunityRow & { weeklyTarget: number })[] {
  return rows
    .filter((r) => r.signalConfidence >= minConfidence)
    .filter((r) => r.liquidityLevel === "high" || r.liquidityLevel === "medium")
    .filter((r) => r.close != null && r.close > 0)
    .map((r) => {
      // Beklenen haftalık getiri: temel %10 + yüksek güven bonusu (max ~%20)
      const conf = r.signalConfidence;
      const base = 10 + Math.min(10, (conf - 60) * 0.5);
      return { ...r, weeklyTarget: Math.round(base) };
    })
    .slice(0, 10);
}

export function BuyList() {
  const marketOpen = useMarketOpen();
  const { data, isPending, isFetching, refetch } = useQuery({
    ...opportunitiesQueryOptions(),
    refetchInterval: marketOpen ? REFRESH_MS : false,
    refetchOnWindowFocus: marketOpen,
  });

  const minConfidence = data?.autoTune?.minConfidence ?? 60;
  const list = pickBuyList(data?.rows ?? [], minConfidence);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Bu Hafta Al</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {data?.updatedAt && <span>Son güncelleme: <b className="text-foreground">{fmtUpdatedTSI(data.updatedAt)}</b></span>}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
            Yenile
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Yaklaşan hafta içinde <b className="text-foreground">%10-20 yükseliş potansiyeli</b> olan, güven eşiği <b className="text-foreground">≥{minConfidence}</b> hisseler.
        Sistem her gece bu eşiği kendi ayarlar.
      </p>

      {isPending ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Bu hafta için eşiği geçen fırsat yok. Sistem eşiği kendisi ayarlıyor; yarın tekrar bak.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {list.map((r) => <BuyCard key={r.symbol} row={r} />)}
        </div>
      )}
    </section>
  );
}

function BuyCard({ row }: { row: OpportunityRow & { weeklyTarget: number } }) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    setHeld(isHeld(row.symbol));
    const sync = () => setHeld(isHeld(row.symbol));
    window.addEventListener("portfolio-changed", sync);
    return () => window.removeEventListener("portfolio-changed", sync);
  }, [row.symbol]);

  const targetPrice = (row.close ?? 0) * (1 + row.weeklyTarget / 100);
  const confColor = row.signalConfidence >= 75 ? "text-success" : row.signalConfidence >= 65 ? "text-primary" : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <Link
              to="/hisse/$symbol"
              params={{ symbol: row.symbol }}
              className="font-display text-lg font-bold text-foreground hover:text-primary"
            >
              {row.symbol}
            </Link>
            <span className="truncate text-xs text-muted-foreground">{row.company_name ?? ""}</span>
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">{row.sector ?? "—"}</div>
        </div>
        <div className={cn("text-right", confColor)}>
          <div className="font-mono text-xl font-bold tabular">{row.signalConfidence}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">güven</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Giriş</div>
          <div className="font-mono font-semibold text-foreground">{row.close?.toFixed(2) ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Hedef</div>
          <div className="font-mono font-semibold text-primary">+{row.weeklyTarget}%</div>
        </div>
        <div>
          <div className="text-muted-foreground">Fiyat hedefi</div>
          <div className="font-mono font-semibold text-foreground">{targetPrice.toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={held || row.close == null}
          onClick={() => {
            if (row.close == null) return;
            addHolding({
              symbol: row.symbol,
              companyName: row.company_name,
              buyDate: new Date().toISOString(),
              buyPrice: row.close,
              targetPct: row.weeklyTarget,
              confidence: row.signalConfidence,
            });
          }}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition",
            held
              ? "bg-success/15 text-success cursor-default"
              : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
          )}
        >
          {held ? (<><Check className="h-4 w-4" /> Portföyde</>) : "Aldım"}
        </button>
        <Link
          to="/hisse/$symbol"
          params={{ symbol: row.symbol }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground hover:bg-secondary"
        >
          Detay <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
