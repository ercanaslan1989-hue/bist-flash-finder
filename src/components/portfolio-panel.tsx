import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, TrendingUp, TrendingDown, X } from "lucide-react";
import { loadActive, loadHistory, removeHolding, summarize, type Holding, type ClosedTrade } from "@/lib/portfolio";
import { opportunitiesQueryOptions } from "@/lib/opportunities";
import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

function usePortfolio() {
  const [active, setActive] = useState<Holding[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  useEffect(() => {
    const sync = () => {
      setActive(loadActive());
      setHistory(loadHistory());
    };
    sync();
    window.addEventListener("portfolio-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("portfolio-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { active, history };
}

export function PortfolioPanel() {
  const { active, history } = usePortfolio();
  const { data } = useQuery(opportunitiesQueryOptions());
  const livePrices = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.rows ?? []) if (r.close != null) m.set(r.symbol, r.close);
    return m;
  }, [data]);

  const summary = summarize(active, history, livePrices);

  if (!active.length && !history.length) {
    return (
      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold text-foreground">Portföyüm</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Henüz alım yok. Yukarıdan "Aldım" ile hisseleri takibe al; canlı kar/zarar burada görünsün.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold text-foreground">Portföyüm</h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Aktif: <b className="text-foreground">{summary.activeCount}</b></span>
          <span>Kapanan: <b className="text-foreground">{summary.closedCount}</b></span>
          {summary.hitRate != null && (
            <span>İsabet: <b className="text-foreground">{(summary.hitRate * 100).toFixed(0)}%</b></span>
          )}
          <span>Ort. getiri:
            <b className={cn("ml-1", summary.totalReturnPct >= 0 ? "text-success" : "text-destructive")}>
              {summary.totalReturnPct >= 0 ? "+" : ""}{summary.totalReturnPct.toFixed(1)}%
            </b>
          </span>
        </div>
      </div>

      {active.length > 0 && (
        <div className="mt-3 space-y-2">
          {active.map((h) => {
            const price = livePrices.get(h.symbol);
            const ret = price != null ? ((price - h.buyPrice) / h.buyPrice) * 100 : null;
            const targetPrice = h.buyPrice * (1 + h.targetPct / 100);
            const toTarget = price != null ? ((targetPrice - price) / price) * 100 : null;
            return (
              <div key={h.symbol} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-base font-semibold text-foreground">{h.symbol}</span>
                    <span className="truncate text-xs text-muted-foreground">{h.companyName ?? ""}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Giriş: <span className="font-mono text-foreground">{h.buyPrice.toFixed(2)}</span>
                    {" · "}Hedef: <span className="font-mono text-foreground">+{h.targetPct}%</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("font-mono text-sm font-semibold tabular",
                    ret == null ? "text-muted-foreground" : ret >= 0 ? "text-success" : "text-destructive")}>
                    {ret == null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {toTarget == null ? "" : toTarget > 0 ? `hedefe %${toTarget.toFixed(1)}` : "hedefte"}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`${h.symbol} sat`}
                  onClick={() => {
                    if (price == null) return;
                    if (confirm(`${h.symbol} ${ret != null ? (ret >= 0 ? "+" : "") + ret.toFixed(1) + "%" : ""} kapansın mı?`)) {
                      removeHolding(h.symbol, price);
                    }
                  }}
                  className="rounded-md border border-border bg-secondary/40 p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-4 rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Geçmiş işlemler ({history.length})
          </summary>
          <div className="mt-3 space-y-1.5 text-sm">
            {history.slice(0, 20).map((t, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0">
                <span className="font-mono text-foreground">{t.symbol}</span>
                <span className="text-xs text-muted-foreground">{t.buyDate.slice(0, 10)} → {t.sellDate.slice(0, 10)}</span>
                <span className={cn("font-mono font-semibold tabular",
                  t.returnPct >= 0 ? "text-success" : "text-destructive")}>
                  {t.returnPct >= 0 ? "+" : ""}{t.returnPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
