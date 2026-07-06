import { Link } from "@tanstack/react-router";
import { scoreTier, stabilityTier } from "@/lib/indicators";
import type { OpportunityRow } from "@/lib/opportunities";
import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ScoreBadge({ score }: { score: number }) {
  const t = scoreTier(score);
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1 rounded-md border px-2 font-mono text-sm font-bold tabular",
        t.bg,
        t.border,
        t.text,
      )}
      title={t.label}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {score}
    </span>
  );
}

export function StabilityBadge({ score }: { score: number }) {
  const t = stabilityTier(score);
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1 rounded-md border px-2 font-mono text-sm font-semibold tabular",
        t.bg,
        t.border,
        t.text,
      )}
      title={`Kararlılık: ${t.label} — aşırı uzamış/aşırı alım kurulumları düşük puan alır`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {score}
    </span>
  );
}

export function OpportunityTable({ rows }: { rows: OpportunityRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="sticky top-0 z-10 rounded-t-xl bg-card">
        <div className="grid grid-cols-[5rem_5rem_minmax(0,1fr)_5rem] items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[6rem_6rem_minmax(0,1fr)_6rem] lg:grid-cols-[7rem_7rem_minmax(0,1fr)_7rem]">
          <span className="text-center">AI Skoru</span>
          <span className="text-center">Kararlılık</span>
          <span>Hisse</span>
          <span className="text-right">Günlük</span>
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((r, idx) => (
          <div
            key={r.symbol}
            className={cn(
              "grid grid-cols-[5rem_5rem_minmax(0,1fr)_5rem] items-center gap-2 px-3 py-3 transition-colors hover:bg-secondary/40",
              idx % 2 === 0 ? "bg-secondary/20" : "bg-card",
            )}
          >
            <ScoreBadge score={r.aiScore} />
            <StabilityBadge score={r.stability} />
            <div className="min-w-0">
              <Link
                to="/hisse/$symbol"
                params={{ symbol: r.symbol }}
                className="font-mono text-sm font-semibold text-foreground hover:text-primary"
              >
                {r.symbol}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{r.company_name ?? "—"}</p>
            </div>
            <span
              className={cn(
                "text-right font-mono text-sm font-semibold tabular",
                (r.dailyReturn ?? 0) > 0
                  ? "text-success"
                  : (r.dailyReturn ?? 0) < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {fmtPct(r.dailyReturn)}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Bu filtrelerle eşleşen hisse bulunamadı.
          </p>
        )}
      </div>
    </div>
  );
}
