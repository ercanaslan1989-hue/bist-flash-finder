import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Database,
  FlaskConical,
  Layers,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { signalsQueryOptions, type SignalRow } from "@/lib/research";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "Validated Pre-Move Signals — BIST Signal Research Lab" },
      {
        name: "description",
        content:
          "Statistically validated BIST signals ranked by predictive power: precision, recall, lift, false positive rate and forward returns measured before +20% runs and +10% limit-up moves (2025–today).",
      },
      { property: "og:title", content: "Validated Pre-Move Signals — BIST Signal Lab" },
      {
        property: "og:description",
        content:
          "Which signals consistently appeared before large BIST moves, with full precision/recall/lift validation.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(signalsQueryOptions()),
  component: SignalsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Could not load validated signals
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">No signal data found.</p>
    </AppShell>
  ),
});

const EVENT_TYPES = [
  {
    value: "run_20",
    label: "+20% within 20 days",
    blurb: "Signals that appeared before a stock gained ≥20% over the following 20 trading days.",
  },
  {
    value: "limit_up",
    label: "+10% limit-up",
    blurb: "Signals that appeared before a BIST daily +10% limit-up day.",
  },
] as const;

const HORIZONS = [1, 2, 3, 5] as const;

function SignalsPage() {
  const { data } = useSuspenseQuery(signalsQueryOptions());
  const router = useRouter();
  const [eventType, setEventType] = useState<string>("run_20");
  const [horizon, setHorizon] = useState<number>(3);

  const { signals, meta } = data;

  const rows = useMemo(
    () =>
      signals
        .filter((s) => s.event_type === eventType && s.horizon === horizon)
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
    [signals, eventType, horizon],
  );

  const activeType = EVENT_TYPES.find((e) => e.value === eventType)!;

  if (signals.length === 0) {
    return (
      <AppShell>
        <EmptyState onRefresh={() => router.invalidate()} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <FlaskConical className="h-3.5 w-3.5" /> Statistical Validation
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Validated pre-move <span className="text-primary">signals</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every candidate signal is tested against the modern BIST market (01 Jan 2025 → today).
            Rolling indicators use full pre-2025 history; only post-2025 days count as research
            outcomes. Each row reports both successful and unsuccessful occurrences. Research only —
            no buy/sell signals.
          </p>
        </div>
      </section>

      {/* Coverage */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Universe"
          value={fmtNum(meta?.stockCount ?? 0)}
          sub="active BIST equities"
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="Snapshots (in scope)"
          value={fmtNum(meta?.snapshotCount ?? 0)}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          label="+20% runs"
          value={fmtNum(meta?.run20Count ?? 0)}
          accent="primary"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="+10% limit-ups"
          value={fmtNum(meta?.limitUpCount ?? 0)}
          accent="accent"
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Research window"
          value={<span className="text-base">{fmtDate(meta?.firstDate)}</span>}
          sub={`through ${fmtDate(meta?.lastDate)}`}
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </section>

      {/* Controls */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Signal ranking</h2>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {EVENT_TYPES.map((e) => (
              <button
                key={e.value}
                onClick={() => setEventType(e.value)}
                className={
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                  (eventType === e.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {e.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Signal seen within</span>
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                    (horizon === h
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {h}d before
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{activeType.blurb}</p>

        <SignalTable rows={rows} />

        <Legend />
      </section>
    </AppShell>
  );
}

function SignalTable({ rows }: { rows: SignalRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[940px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Signal</th>
            <th className="px-3 py-2.5 text-right font-medium">Occur.</th>
            <th className="px-3 py-2.5 text-right font-medium">Success</th>
            <th className="px-3 py-2.5 text-right font-medium">Fail</th>
            <th className="px-3 py-2.5 text-right font-medium">Precision</th>
            <th className="px-3 py-2.5 text-right font-medium">Recall</th>
            <th className="px-3 py-2.5 text-right font-medium">FPR</th>
            <th className="px-3 py-2.5 text-right font-medium">Lift</th>
            <th className="px-3 py-2.5 text-right font-medium">Avg fwd</th>
            <th className="px-3 py-2.5 text-right font-medium">Med fwd</th>
            <th className="px-3 py-2.5 text-right font-medium">Days→</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.rank ?? "—"}</td>
              <td className="px-3 py-2.5 font-medium text-foreground">{r.signal_label}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.occurrences)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-success tabular">
                {fmtNum(r.successes)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.failures)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                {fmtNum(r.precision_pct, 1)}%
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.recall_pct, 1)}%
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.fpr_pct, 1)}%
              </td>
              <td
                className={
                  "px-3 py-2.5 text-right font-mono font-semibold tabular " +
                  ((r.lift ?? 0) >= 1.2
                    ? "text-primary"
                    : (r.lift ?? 0) >= 1
                      ? "text-foreground"
                      : "text-muted-foreground")
                }
              >
                {r.lift === null ? "—" : `${r.lift.toFixed(2)}×`}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                {fmtPct(r.avg_fwd_max20)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtPct(r.median_fwd_max20)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {r.avg_days_to_target === null ? "—" : r.avg_days_to_target.toFixed(1)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                No signals for this combination.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["Occurrences", "Total times the signal was present on an eligible day."],
    ["Success / Fail", "Whether the target move occurred within the horizon after the signal."],
    ["Precision", "Success ÷ occurrences — how often the signal was followed by the move."],
    ["Recall", "Share of all target moves that this signal caught."],
    ["FPR", "False positive rate — share of non-move days that still fired the signal."],
    ["Lift", "Precision ÷ base rate — predictive edge over the unconditional probability."],
    ["Avg / Med fwd", "Average & median best forward 20-day gain after the signal."],
    ["Days→", "Average trading days from signal to the target move."],
  ];
  return (
    <div className="mt-4 grid gap-2 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <p key={k} className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{k}:</span> {v}
        </p>
      ))}
    </div>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <FlaskConical className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 font-display text-lg font-semibold text-foreground">
        No validated signals yet
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Once the research engine finishes signal validation, the ranked table appears here.
      </p>
      <button
        onClick={onRefresh}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Refresh
      </button>
    </div>
  );
}
