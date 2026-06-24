import { createFileRoute } from "@tanstack/react-router";
import { Database, GitBranch, Microscope, ShieldAlert, Sigma } from "lucide-react";

import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — BIST Signal Research Lab" },
      {
        name: "description",
        content:
          "How the BIST Signal Research Lab collects daily snapshots, defines large-move events, captures pre-event features and builds pattern statistics.",
      },
      { property: "og:title", content: "Methodology — BIST Signal Research Lab" },
      {
        property: "og:description",
        content: "The research process: collect, flag events, look back, and measure recurring conditions.",
      },
    ],
  }),
  component: MethodologyPage,
});

const METRICS = [
  "Symbol & company name",
  "Close price & daily return %",
  "Volume",
  "Volume ratio vs 20-day average",
  "Volume ratio vs previous 2 days",
  "Volume ratio vs previous 3 days",
  "5 / 10 / 20 / 30-day returns",
  "Market value",
  "Daily traded value",
  "Sector",
  "KAP announcement count",
  "Last KAP date",
];

const STEPS = [
  {
    icon: Database,
    title: "1 · Collect daily snapshots",
    body: "Every trading day, a snapshot of all BIST stocks is stored — price, return, volume ratios, multi-day returns, market value, traded value, sector and KAP disclosure activity.",
  },
  {
    icon: GitBranch,
    title: "2 · Flag events",
    body: "A day is marked as an event when the stock gains +10%, +15% or +20%, or hits the BIST limit-up cap (~+10% in a single session).",
  },
  {
    icon: Microscope,
    title: "3 · Look back",
    body: "For each event, the lab captures the stock's full metric set 1, 2, 3, 5 and 10 trading days before the move — the conditions that existed beforehand.",
  },
  {
    icon: Sigma,
    title: "4 · Measure patterns",
    body: "Across all events, it builds distributions: the most common volume ratios, 5- and 10-day returns, KAP activity and sectors that preceded large moves.",
  },
];

function MethodologyPage() {
  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold text-foreground">Methodology</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The objective is to discover the highest-probability setup that appears before a stock makes
        a large move — by studying what happened beforehand, not by predicting the future.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.title} className="rounded-xl border border-border bg-card p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <s.icon className="h-4.5 w-4.5" />
            </span>
            <h2 className="mt-3 font-display text-base font-semibold text-foreground">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-base font-semibold text-foreground">Metrics stored daily</h2>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {METRICS.map((m) => (
              <li key={m} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {m}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ShieldAlert className="h-4.5 w-4.5" />
          </span>
          <h2 className="mt-3 font-display text-base font-semibold text-foreground">
            What this lab does not do
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            It does <span className="font-semibold text-foreground">not</span> generate buy or sell
            signals, recommend trades, or predict which stock will move next. It only collects data,
            detects events that already happened, and reports the conditions that recurred before
            them. Sample data shown is synthetic for demonstration; connect a live BIST feed to
            research real market behaviour.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
