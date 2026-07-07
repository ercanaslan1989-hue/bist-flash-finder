import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { OpportunityRow } from "@/lib/opportunities";
import { cn } from "@/lib/utils";

// Developer-mode side-by-side panel: legacy AI score vs the new parallel
// scoring engine, with every module sub-score, aggregate confidence, the
// delta between engines and the reasons that drove the new score.

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-border bg-secondary/30 px-2 py-1.5">
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-sm font-bold tabular text-foreground", className)}>{value}</span>
    </div>
  );
}

export function ScoreCompare({ row }: { row: OpportunityRow }) {
  const { engine } = row;
  const delta = engine.delta;
  const deltaColor =
    delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  return (
    <div className="border-t border-dashed border-border bg-background/60 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-primary">
        <span className="rounded bg-primary/10 px-1.5 py-0.5">Geliştirici modu</span>
        <span className="font-mono text-muted-foreground">{row.symbol}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Metric label="Eski AI" value={engine.legacyScore} className="text-muted-foreground" />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <Metric label="Final" value={engine.total} className="text-primary" />
        <span className={cn("inline-flex items-center gap-1 font-mono text-xs font-bold tabular", deltaColor)}>
          <DeltaIcon className="h-3.5 w-3.5" />
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
        <span className="ml-1 h-6 w-px bg-border" />
        <Metric label="Teknik" value={row.technicalScore} />
        <Metric label="Hacim" value={row.volumeScore} />
        <Metric label="Risk" value={row.riskScore} />
        <Metric label="Güven" value={`${Math.round(engine.confidence * 100)}%`} />
      </div>

      {engine.reasons.length > 0 && (
        <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
          {engine.reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-primary">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
