import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, Flame, TrendingUp } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { researchQueryOptions, type FeatureRow } from "@/lib/research";
import { EVENT_TYPE_LABELS, fmtDate, fmtNum, fmtPct, fmtRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Tespit Edilen Olaylar — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "BIST hisselerinde tespit edilen tüm büyük hareket olayları (+%10/+%15/+%20 ve tavan), hareketten 1, 2, 3, 5 ve 10 işlem günü önce ölçülen metriklerle birlikte.",
      },
      { property: "og:title", content: "Tespit Edilen Olaylar — BIST Sinyal Araştırma Lab" },
      {
        property: "og:description",
        content: "Büyük hareket olaylarını ve her birinden önce oluşan koşulları inceleyin.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(researchQueryOptions()),
  component: EventsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Olay bulunamadı.</p>
    </AppShell>
  ),
});

const FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "limit", label: "Tavan" },
  { value: "gain_10", label: "+%10" },
  { value: "gain_15", label: "+%15" },
  { value: "gain_20", label: "+%20" },
] as const;

function EventsPage() {
  const { data } = useSuspenseQuery(researchQueryOptions());
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);

  const byEvent = useMemo(() => {
    const map = new Map<string, FeatureRow[]>();
    for (const f of data.features) {
      const arr = map.get(f.event_id) ?? [];
      arr.push(f);
      map.set(f.event_id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.days_before - a.days_before);
    return map;
  }, [data.features]);

  const filtered = data.events.filter((e) => {
    if (filter === "all") return true;
    if (filter === "limit") return e.is_limit_up;
    return e.event_type === filter;
  });

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-primary" />
        <h1 className="font-display text-2xl font-bold text-foreground">Tespit edilen olaylar</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {fmtNum(data.events.length)} büyük hareket olayı. Hareketten 1–10 işlem günü önceki metrikleri
        görmek için herhangi bir satırı genişletin.
      </p>

      <div className="mt-5 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {filtered.map((e) => {
          const isOpen = open === e.id;
          const feats = byEvent.get(e.id) ?? [];
          return (
            <div key={e.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                onClick={() => setOpen(isOpen ? null : e.id)}
                className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
              >
                <span className="font-mono text-sm font-semibold text-foreground">{e.symbol}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {fmtDate(e.event_date)}
                </span>
                <span className="text-xs text-muted-foreground">{e.sector}</span>
                <span className="ml-auto flex items-center gap-2">
                  {e.is_limit_up ? (
                    <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                      Tavan
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-mono text-sm font-semibold text-success">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {fmtPct(e.daily_return_pct)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-border px-4 py-4">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="px-2 py-1.5 font-medium">Önceki gün</th>
                          <th className="px-2 py-1.5 text-right font-medium">Kapanış</th>
                          <th className="px-2 py-1.5 text-right font-medium">Hac ×20g</th>
                          <th className="px-2 py-1.5 text-right font-medium">Hac ×3g</th>
                          <th className="px-2 py-1.5 text-right font-medium">5g get.</th>
                          <th className="px-2 py-1.5 text-right font-medium">10g get.</th>
                          <th className="px-2 py-1.5 text-right font-medium">KAP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feats.map((f) => (
                          <tr key={f.id} className="border-t border-border/60">
                            <td className="px-2 py-1.5 font-mono text-foreground">
                              T−{f.days_before}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-foreground tabular">
                              {fmtNum(f.close ?? undefined, 2)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular">
                              <Ratio v={f.vol_ratio_20d} />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular">
                              <Ratio v={f.vol_ratio_3d} />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular">
                              <Signed v={f.ret_5d} />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono tabular">
                              <Signed v={f.ret_10d} />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-foreground tabular">
                              {f.kap_count ?? 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function Ratio({ v }: { v: number | null }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={v >= 1.5 ? "font-semibold text-primary" : "text-foreground"}>{fmtRatio(v)}</span>
  );
}

function Signed({ v }: { v: number | null }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={v >= 0 ? "text-success" : "text-destructive"}>{fmtPct(v)}</span>;
}
