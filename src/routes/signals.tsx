import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Database,
  FlaskConical,
  Layers,
  ShieldCheck,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { topSignalsQueryOptions, type TopSignalRow } from "@/lib/research";
import { fmtDate, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "En Güçlü Doğrulanmış Hareket Öncesi Sinyaller — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "Wilson güvenine göre sıralanan, istatistiksel olarak doğrulanmış en güçlü 20 BIST sinyali: +%20 yükselişler ve +%10 tavan hareketleri öncesinde ölçülen isabet, lift, örneklem büyüklüğü ve z-skoru (2025–bugün).",
      },
      { property: "og:title", content: "En Güçlü Doğrulanmış Sinyaller — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Büyük BIST hareketlerinden önce tutarlı şekilde ortaya çıkan en güçlü sinyaller, istatistiksel güvene göre sıralanmış.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(topSignalsQueryOptions()),
  component: SignalsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Doğrulanmış sinyaller yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Sinyal verisi bulunamadı.</p>
    </AppShell>
  ),
});

const TARGETS = [
  {
    value: "all",
    label: "Tümü",
    blurb: "Tüm hareket hedeflerindeki en güçlü sinyaller, istatistiksel güvene göre sıralanmış.",
  },
  {
    value: "g20",
    label: "+%20 yükseliş",
    blurb: "Bir hissenin sonraki 20 işlem gününde ≥%20 kazandığı durumlardan önce ortaya çıkan sinyaller.",
  },
  {
    value: "lu",
    label: "+%10 tavan",
    blurb: "BIST'te günlük +%10 tavan gününden önce ortaya çıkan sinyaller.",
  },
] as const;

function SignalsPage() {
  const { data } = useSuspenseQuery(topSignalsQueryOptions());
  const router = useRouter();
  const [target, setTarget] = useState<string>("all");

  const { signals, meta, version } = data;

  const rows = useMemo(
    () =>
      signals
        .filter((s) => (target === "all" ? true : s.target_key === target))
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
    [signals, target],
  );

  const activeTarget = TARGETS.find((t) => t.value === target)!;

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
            <FlaskConical className="h-3.5 w-3.5" /> İstatistiksel Doğrulama
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Doğrulanmış en güçlü 20 hareket öncesi <span className="text-primary">sinyali</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Dondurulmuş{" "}
            <span className="font-semibold text-foreground">{version?.version ?? "v1.0"}</span> motorunun
            sakladığı en yüksek güvenli sinyaller; modern BIST piyasasına karşı test edildi (01 Oca 2025 → bugün).
            Hareketli göstergeler 2025 öncesi tüm geçmişi kullanır; yalnızca 2025 sonrası günler sonuç olarak
            sayılır. Wilson güven aralığı alt sınırına göre sıralanmıştır. Yalnızca araştırma amaçlıdır — al/sat sinyali yoktur.
          </p>
        </div>
      </section>

      {/* Coverage */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Evren"
          value={fmtNum(meta?.stockCount ?? 0)}
          sub="aktif BIST hisseleri"
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="Veriler (kapsam içi)"
          value={fmtNum(meta?.snapshotCount ?? 0)}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          label="+%20 yükselişler"
          value={fmtNum(meta?.run20Count ?? 0)}
          accent="primary"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="+%10 tavanlar"
          value={fmtNum(meta?.limitUpCount ?? 0)}
          accent="accent"
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Analiz dönemi"
          value={<span className="text-base">{fmtDate(meta?.firstDate)}</span>}
          sub={`${fmtDate(meta?.lastDate)} tarihine kadar`}
          icon={<CalendarDays className="h-4 w-4" />}
        />
      </section>

      {/* Controls */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Signal ranking</h2>
          {version?.frozen && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              <ShieldCheck className="h-3 w-3" /> {version.version} frozen
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {TARGETS.map((t) => (
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

        <p className="mt-3 text-sm text-muted-foreground">{activeTarget.blurb}</p>

        <SignalTable rows={rows} />

        <Legend />
      </section>
    </AppShell>
  );
}

const TARGET_LABELS: Record<string, string> = {
  g20: "+20% run",
  g15: "+15%",
  g10: "+10%",
  lu: "limit-up",
};

function SignalTable({ rows }: { rows: TopSignalRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Signal</th>
            <th className="px-3 py-2.5 font-medium">Target</th>
            <th className="px-3 py-2.5 text-right font-medium">Within</th>
            <th className="px-3 py-2.5 text-right font-medium">Occur.</th>
            <th className="px-3 py-2.5 text-right font-medium">Precision</th>
            <th className="px-3 py-2.5 text-right font-medium">CI-low</th>
            <th className="px-3 py-2.5 text-right font-medium">Lift</th>
            <th className="px-3 py-2.5 text-right font-medium">z</th>
            <th className="px-3 py-2.5 text-right font-medium">Conf.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.rank ?? "—"}</td>
              <td className="px-3 py-2.5 font-medium text-foreground">{r.label}</td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  {TARGET_LABELS[r.target_key] ?? r.target_key}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {r.horizon}d
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {fmtNum(r.occurrences)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground tabular">
                {fmtNum(r.precision_pct, 1)}%
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {r.ci_low === null ? "—" : `${fmtNum(r.ci_low, 1)}%`}
              </td>
              <td
                className={
                  "px-3 py-2.5 text-right font-mono font-semibold tabular " +
                  ((r.lift ?? 0) >= 1.5
                    ? "text-primary"
                    : (r.lift ?? 0) >= 1
                      ? "text-foreground"
                      : "text-muted-foreground")
                }
              >
                {r.lift === null ? "—" : `${r.lift.toFixed(2)}×`}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {r.z_score === null ? "—" : r.z_score.toFixed(1)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {r.confidence === null ? "—" : `${fmtNum(r.confidence, 0)}%`}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                No signals for this target.
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
    ["Signal", "A validated condition (or AND-combination) present on the snapshot day."],
    ["Target / Within", "The move being predicted and the trading-day horizon it must occur in."],
    ["Occurrences", "Total times the signal was present on an eligible day in scope."],
    ["Precision", "Share of occurrences followed by the target move."],
    ["CI-low", "Wilson 95% confidence lower bound on precision — the conservative edge estimate."],
    ["Lift", "Precision ÷ base rate — predictive edge over the unconditional probability."],
    ["z / Conf.", "Significance vs base rate and the engine's overall confidence score."],
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
