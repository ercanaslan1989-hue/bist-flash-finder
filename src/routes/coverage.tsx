import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, ListChecks, PieChart, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { coverageQueryOptions, type CoverageSymbolRow } from "@/lib/research";
import { fmtDate, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/coverage")({
  head: () => ({
    meta: [
      { title: "BIST Veri Kapsama Raporu — BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "Güncel aktif BIST hisse senedi evreninin kapsamı: içe aktarılan ve eksik şirketler, şirket bazında veri derinliği ve genel kapsama yüzdesi.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(coverageQueryOptions()),
  component: CoveragePage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Kapsama raporu yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Kapsama raporu bulunamadı.</p>
    </AppShell>
  ),
});

function CoveragePage() {
  const { data } = useSuspenseQuery(coverageQueryOptions());
  const router = useRouter();
  const { report, symbols } = data;
  const [onlyMissing, setOnlyMissing] = useState(false);

  const rows = useMemo(
    () =>
      symbols
        .filter((s) => (onlyMissing ? s.in_universe && !s.has_data : true))
        .sort((a, b) => (a.n_days ?? 0) - (b.n_days ?? 0)),
    [symbols, onlyMissing],
  );

  const derived = report?.universe_source === "derived_from_stocks";

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ListChecks className="h-3.5 w-3.5" /> Data Coverage
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            BIST universe <span className="text-primary">coverage report</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Reconciles the active BIST common-equity universe against imported price history and
            reports per-company depth, missing tickers and overall coverage.
          </p>
        </div>
      </section>

      {derived && (
        <div className="mt-6 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>
            The active universe is currently <strong>derived from imported tickers</strong>, not an
            authoritative exchange list. Coverage shows 100% until a real current active list (and
            recent IPOs) is supplied — at which point genuinely missing companies will surface here.
          </p>
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Active companies"
          value={fmtNum(report?.total_active ?? 0)}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          label="Imported"
          value={fmtNum(report?.imported ?? 0)}
          accent="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Missing"
          value={fmtNum(report?.missing ?? 0)}
          accent={(report?.missing ?? 0) > 0 ? "accent" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="Coverage"
          value={`${fmtNum(report?.coverage_pct ?? 0, 1)}%`}
          accent="primary"
          sub={report?.generated_at ? `as of ${fmtDate(report.generated_at)}` : undefined}
          icon={<PieChart className="h-4 w-4" />}
        />
      </section>

      {report?.missing_symbols && report.missing_symbols.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-sm font-semibold text-foreground">Missing companies</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.missing_symbols.map((s) => (
              <span key={s} className="rounded bg-accent/15 px-2 py-0.5 font-mono text-xs text-accent">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-foreground">History per company</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyMissing((v) => !v)}
              className={
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
                (onlyMissing
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-secondary/40 text-muted-foreground")
              }
            >
              {onlyMissing ? "Showing missing only" : "Show missing only"}
            </button>
            <button
              onClick={() => router.invalidate()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>

        <CoverageTable rows={rows} />
      </section>
    </AppShell>
  );
}

function CoverageTable({ rows }: { rows: CoverageSymbolRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Symbol</th>
            <th className="px-3 py-2.5 font-medium">Company</th>
            <th className="px-3 py-2.5 text-center font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Earliest</th>
            <th className="px-3 py-2.5 font-medium">Latest</th>
            <th className="px-3 py-2.5 text-right font-medium">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.symbol} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
              <td className="px-3 py-2.5 font-mono text-sm font-semibold text-foreground">{r.symbol}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{r.company_name ?? "—"}</td>
              <td className="px-3 py-2.5 text-center">
                {r.has_data ? (
                  <span className="rounded bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
                    data
                  </span>
                ) : (
                  <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    missing
                  </span>
                )}
                {r.in_universe === false && (
                  <span className="ml-1 rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    not listed
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{fmtDate(r.earliest_date)}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{fmtDate(r.latest_date)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">{fmtNum(r.n_days)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                No companies to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
