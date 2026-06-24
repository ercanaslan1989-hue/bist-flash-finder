import type { Bucket } from "@/lib/analysis";
import { cn } from "@/lib/utils";

export function DistributionBars({
  title,
  subtitle,
  buckets,
  barClass = "bg-primary",
  icon,
}: {
  title: string;
  subtitle?: string;
  buckets: Bucket[];
  barClass?: string;
  icon?: React.ReactNode;
}) {
  const max = Math.max(...buckets.map((b) => b.pct), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div className="space-y-2.5">
        {buckets.map((b) => (
          <div key={b.label} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{b.label}</span>
            <div className="h-5 overflow-hidden rounded bg-secondary/60">
              <div
                className={cn("h-full rounded transition-all", barClass)}
                style={{ width: `${(b.pct / max) * 100}%` }}
              />
            </div>
            <span className="text-right font-mono text-xs font-medium text-foreground">
              {b.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
