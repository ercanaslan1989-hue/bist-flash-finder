import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarChart3, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { featureImportanceQueryOptions, type FeatureImportanceRow } from "@/lib/research";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/feature-importance")({
  head: () => ({
    meta: [
      { title: "Göstergeler — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "Büyük BIST hareketlerinden önce en çok hangi ham sinyaller önemli: göstergeler, doğrulanmış kalıplarda ne sıklıkta yer aldıklarına ve katkı sundukları ortalama isabet ve lift değerine göre sıralanmış. Yalnızca araştırma amaçlıdır.",
      },
      { property: "og:title", content: "Göstergeler — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Doğrulanmış v1.0 BIST hareket öncesi kalıplarının arkasındaki sıralı öngörü göstergeleri.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(featureImportanceQueryOptions()),
  component: FeatureImportancePage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Göstergeler yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Gösterge verisi bulunamadı.</p>
    </AppShell>
  ),
});

const TARGETS = [
  { value: "all", label: "Tümü" },
  { value: "g20", label: "+%20 yükseliş" },
  { value: "g15", label: "+%15" },
  { value: "g10", label: "+%10" },
  { value: "lu", label: "tavan" },
] as const;

function FeatureImportancePage() {
  const { data: rows } = useSuspenseQuery(featureImportanceQueryOptions());
  const [target, setTarget] = useState<string>("all");

  const targets = useMemo(() => {
    const set = new Set(rows.map((r) => r.target_key));
    return TARGETS.filter((t) => t.value === "all" || set.has(t.value));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (target === "all" ? true : r.target_key === target))
        .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)),
    [rows, target],
  );

  const maxImportance = useMemo(
    () => Math.max(1, ...filtered.map((r) => r.importance ?? 0)),
    [filtered],
  );

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Etken Analizi
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Gösterge <span className="text-primary">önemi</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Büyük BIST hareketlerinden önce en çok hangi ham koşullar önemli. Önem, bir göstergenin
            doğrulanmış kalıplarda ne sıklıkta yer aldığını, sunduğu isabet ve lift ile birleştirir.
            Yalnızca araştırma amaçlıdır — al/sat sinyali yoktur.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Ranked features</h2>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {targets.map((t) => (
            <button
              key={t.value}
              onClick={() => setTarget(t.value)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (target === t.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Feature</th>
                <th className="px-3 py-2.5 font-medium">Group</th>
                <th className="px-3 py-2.5 text-right font-medium">Appears</th>
                <th className="px-3 py-2.5 text-right font-medium">Avg prec.</th>
                <th className="px-3 py-2.5 text-right font-medium">Avg lift</th>
                <th className="px-3 py-2.5 font-medium">Importance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <Row key={r.id} r={r} zebra={idx % 2 === 1} max={maxImportance} idx={idx + 1} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No features for this target.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Row({
  r,
  zebra,
  max,
  idx,
}: {
  r: FeatureImportanceRow;
  zebra: boolean;
  max: number;
  idx: number;
}) {
  const pct = Math.round(((r.importance ?? 0) / max) * 100);
  return (
    <tr className={zebra ? "bg-card" : "bg-secondary/20"}>
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{idx}</td>
      <td className="px-3 py-2.5 font-medium text-foreground">{r.label}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{r.feature_group ?? "—"}</td>
      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
        {fmtNum(r.appearances)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
        {r.avg_precision === null ? "—" : `${r.avg_precision.toFixed(1)}%`}
      </td>
      <td
        className={
          "px-3 py-2.5 text-right font-mono font-semibold tabular " +
          ((r.avg_lift ?? 0) >= 1.2 ? "text-primary" : "text-muted-foreground")
        }
      >
        {r.avg_lift === null ? "—" : `${r.avg_lift.toFixed(2)}×`}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs text-muted-foreground tabular">
            {fmtNum(r.importance, 1)}
          </span>
        </div>
      </td>
    </tr>
  );
}
