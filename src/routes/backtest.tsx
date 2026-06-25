import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarRange, Gauge, LineChart, Target, TrendingUp } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import {
  backtestQueryOptions,
  type BacktestMonthRow,
  type WalkforwardMonthRow,
} from "@/lib/research";
import { fmtNum, fmtPct } from "@/lib/format";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Geçmiş Performans ve Walk-Forward — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "v1.0 BIST araştırma motorunun ay ay tekrarı: Ocak 2025'ten itibaren isabet, başarı oranı, sinyal sayıları ve ortalama ileri getiriler, walk-forward kalibrasyonuyla birlikte. Yalnızca araştırma amaçlıdır.",
      },
      { property: "og:title", content: "Geçmiş Performans — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Doğrulanmış BIST hareket öncesi kalıplarının ay ay, gün gün walk-forward tekrarı.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(backtestQueryOptions()),
  component: BacktestPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Geçmiş performans yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Geçmiş performans verisi bulunamadı.</p>
    </AppShell>
  ),
});

const TARGETS = [
  { value: "g20", label: "+%20 yükseliş" },
  { value: "g15", label: "+%15" },
  { value: "g10", label: "+%10" },
  { value: "lu", label: "tavan" },
] as const;

const monthLabel = (d: string) =>
  new Date(d).toLocaleDateString("tr-TR", { month: "short", year: "numeric" });

function BacktestPage() {
  const { data } = useSuspenseQuery(backtestQueryOptions());
  const { monthly, walkforward, summary } = data;

  const availableTargets = useMemo(() => {
    const set = new Set(monthly.map((m) => m.target_key));
    return TARGETS.filter((t) => set.has(t.value));
  }, [monthly]);

  const [target, setTarget] = useState<string>(availableTargets[0]?.value ?? "g20");

  const monthRows = useMemo(
    () =>
      monthly
        .filter((m) => m.target_key === target)
        .sort((a, b) => a.month.localeCompare(b.month)),
    [monthly, target],
  );

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <LineChart className="h-3.5 w-3.5" /> Walk-Forward Tekrarı
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Aylık <span className="text-primary">geçmiş performans</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Motor, Ocak 2025'ten itibaren piyasayı yalnızca aynı gün bilgisini kullanarak gün gün
            yeniden oynattı. Aşağıda aylık isabet ve başarı oranı ile genel walk-forward kalibrasyonu
            yer alır. Yalnızca araştırma amaçlıdır — al/sat sinyali yoktur.
          </p>
        </div>
      </section>

      {summary && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Genel isabet"
            value={`%${fmtNum(summary.overall_precision, 1)}`}
            sub={`aylık ortalama %${fmtNum(summary.avg_monthly_precision, 1)}`}
            accent="primary"
            icon={<Target className="h-4 w-4" />}
          />
          <StatCard
            label="Başarı oranı"
            value={`%${fmtNum(summary.hit_rate, 1)}`}
            sub="pozitif ileri getiriler"
            icon={<Gauge className="h-4 w-4" />}
          />
          <StatCard
            label="Ort. ileri getiri"
            value={fmtPct(summary.avg_fwd_return)}
            accent="success"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Tekrarlanan sinyaller"
            value={fmtNum(summary.total_signals)}
            icon={<CalendarRange className="h-4 w-4" />}
          />
        </section>
      )}

      {/* Monthly backtest by target */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">
            Hedefe göre aylık isabet
          </h2>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {availableTargets.map((t) => (
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

        <BacktestTable rows={monthRows} />
      </section>

      {/* Walk-forward */}
      {walkforward.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold text-foreground">
              Walk-forward (tüm izleme listesi sinyalleri)
            </h2>
          </div>
          <WalkforwardTable rows={walkforward} />
        </section>
      )}

      {summary && (
        <section className="mt-8 rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-sm font-semibold text-foreground">Kalibrasyon</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            En iyi ay{" "}
            <span className="font-semibold text-foreground">
              {summary.best_month ? monthLabel(summary.best_month) : "—"}
            </span>{" "}
            (%{fmtNum(summary.best_month_precision, 1)}) · En kötü ay{" "}
            <span className="font-semibold text-foreground">
              {summary.worst_month ? monthLabel(summary.worst_month) : "—"}
            </span>{" "}
            (%{fmtNum(summary.worst_month_precision, 1)}).
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Kalibrasyon: tahmin{" "}
            <span className="font-mono text-foreground">%{fmtNum(summary.calib_low_pred, 1)}</span> →
            gerçek{" "}
            <span className="font-mono text-foreground">%{fmtNum(summary.calib_low_actual, 1)}</span>;
            tahmin{" "}
            <span className="font-mono text-foreground">%{fmtNum(summary.calib_high_pred, 1)}</span> →
            gerçek{" "}
            <span className="font-mono text-foreground">
              %{fmtNum(summary.calib_high_actual, 1)}
            </span>
            .
          </p>
        </section>
      )}
    </AppShell>
  );
}

function BacktestTable({ rows }: { rows: BacktestMonthRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Ay</th>
            <th className="px-3 py-2.5 text-right font-medium">Görülme</th>
            <th className="px-3 py-2.5 text-right font-medium">Başarı</th>
            <th className="px-3 py-2.5 text-right font-medium">İsabet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
              <td className="px-3 py-2.5 font-medium text-foreground">{monthLabel(r.month)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.occurrences)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-success tabular">
                {fmtNum(r.successes)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground tabular">
                {fmtNum(r.precision_pct, 1)}%
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                Bu hedef için ay yok.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WalkforwardTable({ rows }: { rows: WalkforwardMonthRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Ay</th>
            <th className="px-3 py-2.5 text-right font-medium">Sinyaller</th>
            <th className="px-3 py-2.5 text-right font-medium">İsabet</th>
            <th className="px-3 py-2.5 text-right font-medium">Ort. ileri getiri</th>
            <th className="px-3 py-2.5 text-right font-medium">Başarı oranı (+)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
              <td className="px-3 py-2.5 font-medium text-foreground">{monthLabel(r.month)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.n_signals)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground tabular">
                {fmtNum(r.precision_pct, 1)}%
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                {fmtPct(r.avg_fwd_return)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.hit_rate_pos, 1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
