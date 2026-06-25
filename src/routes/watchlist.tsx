import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays, Gauge, Layers, ListChecks, Radar } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { watchlistQueryOptions, type WatchlistRow } from "@/lib/research";
import { fmtDate, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Günlük Yapay Zeka İzleme Listesi — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "Her aktif BIST hissesi v1.0 araştırma motoru tarafından günlük puanlanır: büyük hareket olasılığı tahmini, eşleşen kalıplar, güven ve geçmiş başarı oranı. Yalnızca araştırma amaçlıdır — al/sat sinyali yoktur.",
      },
      { property: "og:title", content: "Günlük Yapay Zeka İzleme Listesi — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Dondurulmuş v1.0 motorundan tüm aktif BIST evreni için günlük büyük-hareket olasılığı skorları.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(watchlistQueryOptions()),
  component: WatchlistPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          İzleme listesi yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">İzleme listesi verisi bulunamadı.</p>
    </AppShell>
  ),
});

const TARGET_LABELS: Record<string, string> = {
  g20: "+%20 yükseliş",
  g15: "+%15",
  g10: "+%10",
  lu: "tavan",
};

function WatchlistPage() {
  const { data } = useSuspenseQuery(watchlistQueryOptions());
  const router = useRouter();
  const { rows, scoreDate, total, elevated } = data;
  const [onlyElevated, setOnlyElevated] = useState<boolean>(false);
  const [q, setQ] = useState<string>("");

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return rows
      .filter((r) => (onlyElevated ? (r.matched_patterns ?? 0) > 0 : true))
      .filter((r) =>
        needle === ""
          ? true
          : r.symbol.toUpperCase().includes(needle) ||
            (r.company_name ?? "").toUpperCase().includes(needle),
      );
  }, [rows, onlyElevated, q]);

  const avgProb = useMemo(() => {
    if (rows.length === 0) return 0;
    const sum = rows.reduce((acc, r) => acc + (r.probability ?? 0), 0);
    return sum / rows.length;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Radar className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 font-display text-lg font-semibold text-foreground">
            Henüz izleme listesi skoru yok
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Günlük puanlayıcı henüz satır üretmedi. Her motor yenilemesinden sonra çalışır.
          </p>
          <button
            onClick={() => router.invalidate()}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Yenile
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Radar className="h-3.5 w-3.5" /> Günlük Puanlama
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Günlük yapay zeka <span className="text-primary">izleme listesi</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Her aktif BIST hissesi, en son işlem günü için dondurulmuş v1.0 motoru tarafından puanlanır.
            Doğrulanmış kalıplarla eşleşen hisseler taban oranın üzerine çıkarılır; geri kalanlar koşulsuz
            olasılığı taşır. Bu bir al/sat sinyali değil, kalıp araştırmasıdır.
          </p>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Stocks scored"
          value={fmtNum(total)}
          sub="latest trading day"
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="Pattern-matched"
          value={fmtNum(elevated)}
          accent="primary"
          sub="elevated above base rate"
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Avg probability"
          value={`${fmtNum(avgProb, 1)}%`}
          icon={<Gauge className="h-4 w-4" />}
        />
        <StatCard
          label="Score date"
          value={<span className="text-base">{fmtDate(scoreDate)}</span>}
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol or company…"
            className="h-9 w-full rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground sm:max-w-xs"
          />
          <button
            onClick={() => setOnlyElevated((v) => !v)}
            className={
              "h-9 rounded-md border px-3 text-sm font-medium transition-colors " +
              (onlyElevated
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground")
            }
          >
            {onlyElevated ? "Showing pattern-matched only" : "Show pattern-matched only"}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Symbol</th>
                <th className="px-3 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium">Sector</th>
                <th className="px-3 py-2.5 text-right font-medium">Probability</th>
                <th className="px-3 py-2.5 text-right font-medium">Conf.</th>
                <th className="px-3 py-2.5 text-right font-medium">Patterns</th>
                <th className="px-3 py-2.5 font-medium">Best target</th>
                <th className="px-3 py-2.5 text-right font-medium">Hist. success</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <Row key={r.id} r={r} zebra={idx % 2 === 1} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No stocks match this filter.
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

function Row({ r, zebra }: { r: WatchlistRow; zebra: boolean }) {
  const matched = (r.matched_patterns ?? 0) > 0;
  return (
    <tr className={zebra ? "bg-card" : "bg-secondary/20"}>
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.rank ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono font-semibold text-foreground">{r.symbol}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{r.company_name ?? "—"}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{r.sector ?? "—"}</td>
      <td
        className={
          "px-3 py-2.5 text-right font-mono font-semibold tabular " +
          (matched ? "text-primary" : "text-muted-foreground")
        }
      >
        {r.probability === null ? "—" : `${r.probability.toFixed(1)}%`}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
        {r.confidence === null ? "—" : `${fmtNum(r.confidence, 0)}%`}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular">
        {matched ? (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
            {r.matched_patterns}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {r.best_target ? (TARGET_LABELS[r.best_target] ?? r.best_target) : "—"}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
        {r.hist_success_pct === null ? "—" : `${r.hist_success_pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}
