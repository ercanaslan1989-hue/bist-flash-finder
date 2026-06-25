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
      { title: "Monthly Backtest & Walk-Forward — BIST Signal Research Lab" },
      {
        name: "description",
        content:
          "Month-by-month replay of the v1.0 BIST research engine: precision, hit rate, signal counts and average forward returns from Jan 2025, with walk-forward calibration. Research only.",
      },
      { property: "og:title", content: "Monthly Backtest — BIST Signal Lab" },
      {
        property: "og:description",
        content:
          "Walk-forward day-by-day replay of validated BIST pre-move patterns, month by month.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(backtestQueryOptions()),
  component: BacktestPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Could not load the backtest
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">No backtest data found.</p>
    </AppShell>
  ),
});

const TARGETS = [
  { value: "g20", label: "+20% run" },
  { value: "g15", label: "+15%" },
  { value: "g10", label: "+10%" },
  { value: "lu", label: "limit-up" },
] as const;

const monthLabel = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

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
            <LineChart className="h-3.5 w-3.5" /> Walk-Forward Replay
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Monthly <span className="text-primary">backtest</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            The engine replayed the market day-by-day from Jan 2025 using only same-day information.
            Below is per-month precision and hit rate, plus the overall walk-forward calibration.
            Research only — no buy/sell signals.
          </p>
        </div>
      </section>

      {summary && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Overall precision"
            value={`${fmtNum(summary.overall_precision, 1)}%`}
            sub={`avg monthly ${fmtNum(summary.avg_monthly_precision, 1)}%`}
            accent="primary"
            icon={<Target className="h-4 w-4" />}
          />
          <StatCard
            label="Hit rate"
            value={`${fmtNum(summary.hit_rate, 1)}%`}
            sub="positive forward returns"
            icon={<Gauge className="h-4 w-4" />}
          />
          <StatCard
            label="Avg forward return"
            value={fmtPct(summary.avg_fwd_return)}
            accent="success"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Signals replayed"
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
            Monthly precision by target
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
              Walk-forward (all watchlist signals)
            </h2>
          </div>
          <WalkforwardTable rows={walkforward} />
        </section>
      )}

      {summary && (
        <section className="mt-8 rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-sm font-semibold text-foreground">Calibration</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Best month{" "}
            <span className="font-semibold text-foreground">
              {summary.best_month ? monthLabel(summary.best_month) : "—"}
            </span>{" "}
            ({fmtNum(summary.best_month_precision, 1)}%) · Worst month{" "}
            <span className="font-semibold text-foreground">
              {summary.worst_month ? monthLabel(summary.worst_month) : "—"}
            </span>{" "}
            ({fmtNum(summary.worst_month_precision, 1)}%).
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Calibration: predicted{" "}
            <span className="font-mono text-foreground">{fmtNum(summary.calib_low_pred, 1)}%</span> →
            actual{" "}
            <span className="font-mono text-foreground">{fmtNum(summary.calib_low_actual, 1)}%</span>;
            predicted{" "}
            <span className="font-mono text-foreground">{fmtNum(summary.calib_high_pred, 1)}%</span> →
            actual{" "}
            <span className="font-mono text-foreground">
              {fmtNum(summary.calib_high_actual, 1)}%
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
            <th className="px-3 py-2.5 font-medium">Month</th>
            <th className="px-3 py-2.5 text-right font-medium">Occurrences</th>
            <th className="px-3 py-2.5 text-right font-medium">Successes</th>
            <th className="px-3 py-2.5 text-right font-medium">Precision</th>
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
                No months for this target.
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
            <th className="px-3 py-2.5 font-medium">Month</th>
            <th className="px-3 py-2.5 text-right font-medium">Signals</th>
            <th className="px-3 py-2.5 text-right font-medium">Precision</th>
            <th className="px-3 py-2.5 text-right font-medium">Avg fwd return</th>
            <th className="px-3 py-2.5 text-right font-medium">Hit rate (+)</th>
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
