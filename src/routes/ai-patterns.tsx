import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Database,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { aiPatternsQueryOptions, type AiPatternRow } from "@/lib/research";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";

export const Route = createFileRoute("/ai-patterns")({
  head: () => ({
    meta: [
      { title: "Yapay Zeka ile Keşfedilen En Güçlü Hareket Öncesi Kalıplar — BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "On binlerce gösterge kombinasyonu modern BIST piyasasına karşı otomatik test edildi. Dört bağımsız hareket hedefi için lift, isabet, geri çağırma ve güvene göre sıralanan istatistiksel olarak doğrulanmış en güçlü kalıplar.",
      },
      { property: "og:title", content: "Yapay Zeka Kalıp Keşfi — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Büyük BIST hareketlerinden önce ortaya çıkan, otomatik keşfedilmiş ve istatistiksel olarak doğrulanmış kalıplar (2025–bugün).",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(aiPatternsQueryOptions()),
  component: AiPatternsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Yapay zeka kalıpları yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Yapay zeka kalıbı bulunamadı.</p>
    </AppShell>
  ),
});

const TARGETS = [
  { value: "g20", label: "20 günde +%20", horizon: 20 },
  { value: "g15", label: "10 günde +%15", horizon: 10 },
  { value: "g10", label: "5 günde +%10", horizon: 5 },
  { value: "lu", label: "+%10 tavan", horizon: 5 },
] as const;

const MCAP_OPTIONS = [
  { value: "any", label: "Tüm piyasa değerleri" },
  { value: "mcap_small", label: "Medyan altı" },
  { value: "mcap_micro", label: "Mikro (en küçük %20)" },
] as const;

const SIZE_OPTIONS = [
  { value: 0, label: "Tüm boyutlar" },
  { value: 1, label: "Tekli" },
  { value: 2, label: "İkili" },
  { value: 3, label: "Üçlü" },
] as const;

function AiPatternsPage() {
  const { data } = useSuspenseQuery(aiPatternsQueryOptions());
  const router = useRouter();
  const { patterns, meta } = data;

  const [target, setTarget] = useState<string>("g20");
  const [sector, setSector] = useState<string>("any");
  const [mcap, setMcap] = useState<string>("any");
  const [size, setSize] = useState<number>(0);
  const [minPrecision, setMinPrecision] = useState<number>(0);
  const [minLift, setMinLift] = useState<number>(1);
  const [sigOnly, setSigOnly] = useState<boolean>(true);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const p of patterns) {
      for (const k of p.pred_keys) {
        if (k.startsWith("sector:")) set.add(k.slice(7));
      }
    }
    return Array.from(set).sort();
  }, [patterns]);

  const rows = useMemo(() => {
    return patterns
      .filter((p) => p.target_key === target)
      .filter((p) => (sigOnly ? p.significant : true))
      .filter((p) => (size === 0 ? true : p.n_preds === size))
      .filter((p) => (sector === "any" ? true : p.pred_keys.includes(`sector:${sector}`)))
      .filter((p) => (mcap === "any" ? true : p.pred_keys.includes(mcap)))
      .filter((p) => (p.precision_pct ?? 0) >= minPrecision)
      .filter((p) => (p.lift ?? 0) >= minLift)
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
      .slice(0, 100);
  }, [patterns, target, sigOnly, size, sector, mcap, minPrecision, minLift]);

  const activeTarget = TARGETS.find((t) => t.value === target)!;
  const running = meta?.status === "running";

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <BrainCircuit className="h-3.5 w-3.5" /> Yapay Zeka Kalıp Keşfi
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Otomatik <span className="text-primary">keşfedilen</span> en güçlü 100 hareket öncesi kalıbı
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Motor ~45 aday göstergeyi ikili hale getirir; tekli, ikili ve üçlü on binlerce kombinasyonu
            otomatik üretip dört bağımsız hedefe karşı puanlar ve yalnızca istatistiksel doğrulamayı
            geçen kalıpları saklar. Hareketli göstergeler 2025 öncesi tüm geçmişi kullanır; yalnızca
            2025 sonrası günler sonuç olarak sayılır. Yalnızca araştırma amaçlıdır — al/sat sinyali yoktur.
          </p>
        </div>
      </section>

      {/* Engine status */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Motor durumu"
          value={
            <span className="flex items-center gap-1.5 text-base capitalize">
              {running && <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />}
              {meta?.status ?? "—"}
            </span>
          }
          sub={meta?.phase ?? undefined}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Analiz edilen veriler"
          value={fmtNum(meta?.matrix_rows ?? 0)}
          sub="2025 → bugün"
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          label="Kaydedilen patternler"
          value={fmtNum(meta?.n_patterns ?? 0)}
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="Anlamlı patternler"
          value={fmtNum(meta?.n_significant ?? 0)}
          accent="primary"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Son çalıştırma"
          value={<span className="text-base">{fmtDate(meta?.last_run_at)}</span>}
          sub="aylık yenilenir"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </section>

      {patterns.length === 0 ? (
        <EmptyState running={running} phase={meta?.phase} onRefresh={() => router.invalidate()} />
      ) : (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold text-foreground">Sıralı kalıplar</h2>
          </div>

          {/* Target tabs */}
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

          {/* Filters */}
          <div className="mt-4 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Sektör">
              <Select value={sector} onChange={setSector}>
                <option value="any">Tüm sektörler</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Piyasa değeri">
              <Select value={mcap} onChange={setMcap}>
                {MCAP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kalıp boyutu">
              <Select value={String(size)} onChange={(v) => setSize(Number(v))}>
                {SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Yalnızca anlamlı">
              <button
                onClick={() => setSigOnly((s) => !s)}
                className={
                  "h-9 rounded-md border px-3 text-sm font-medium transition-colors " +
                  (sigOnly
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-secondary/40 text-muted-foreground")
                }
              >
                {sigOnly ? "Açık (p < 0.05, lift ≥ 1.2)" : "Kapalı"}
              </button>
            </Field>
            <Field label={`Min. isabet — %${minPrecision}`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minPrecision}
                onChange={(e) => setMinPrecision(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </Field>
            <Field label={`Min. lift — ${minLift.toFixed(1)}×`}>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={minLift}
                onChange={(e) => setMinLift(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </Field>
            <div className="flex items-end">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{activeTarget.label}</span> için ilk 100
                kalıptan <span className="font-semibold text-foreground">{rows.length}</span> tanesi gösteriliyor.
              </p>
            </div>
          </div>

          <PatternTable rows={rows} />
          <Legend />
        </section>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-secondary/40 px-2 text-sm text-foreground"
    >
      {children}
    </select>
  );
}

function PatternTable({ rows }: { rows: AiPatternRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Kalıp</th>
            <th className="px-3 py-2.5 text-right font-medium">Görülme</th>
            <th className="px-3 py-2.5 text-right font-medium">Başarı</th>
            <th className="px-3 py-2.5 text-right font-medium">Başarısız</th>
            <th className="px-3 py-2.5 text-right font-medium">İsabet</th>
            <th className="px-3 py-2.5 text-right font-medium">%95 GA</th>
            <th className="px-3 py-2.5 text-right font-medium">Geri çağırma</th>
            <th className="px-3 py-2.5 text-right font-medium">YPO</th>
            <th className="px-3 py-2.5 text-right font-medium">Lift</th>
            <th className="px-3 py-2.5 text-right font-medium">Ort. ileri</th>
            <th className="px-3 py-2.5 text-right font-medium">Gün→</th>
            <th className="px-3 py-2.5 text-right font-medium">Kalite</th>
            <th className="px-3 py-2.5 text-right font-medium">p</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.rank ?? "—"}</td>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{r.label}</span>
                  {r.significant && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      anlamlı
                    </span>
                  )}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">{fmtNum(r.occurrences)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-success tabular">{fmtNum(r.successes)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">{fmtNum(r.failures)}</td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground tabular">
                {fmtNum(r.precision_pct, 1)}%
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground tabular">
                {r.ci_low === null ? "—" : `${fmtNum(r.ci_low, 0)}–${fmtNum(r.ci_high, 0)}%`}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">{fmtNum(r.recall_pct, 1)}%</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">{fmtNum(r.fpr_pct, 1)}%</td>
              <td
                className={
                  "px-3 py-2.5 text-right font-mono font-semibold tabular " +
                  ((r.lift ?? 0) >= 1.5 ? "text-primary" : (r.lift ?? 0) >= 1 ? "text-foreground" : "text-muted-foreground")
                }
              >
                {r.lift === null ? "—" : `${r.lift.toFixed(2)}×`}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">{fmtPct(r.avg_fwd)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {r.avg_days_to_target === null ? "—" : r.avg_days_to_target.toFixed(1)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs tabular">
                {r.overfit ? (
                  <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-semibold uppercase text-destructive">
                    aşırı uyum
                  </span>
                ) : r.robust ? (
                  <span className="rounded bg-success/15 px-1.5 py-0.5 font-semibold uppercase text-success">
                    sağlam
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground tabular">
                {r.p_value === null ? "—" : r.p_value < 0.001 ? "<0.001" : r.p_value.toFixed(3)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={14} className="px-3 py-6 text-center text-muted-foreground">
                Bu filtrelerle eşleşen kalıp yok.
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
    ["Pattern", "An AND-combination of 1–3 binarized features the engine discovered automatically."],
    ["Precision / 95% CI", "Share of occurrences followed by the target move, with Wilson confidence interval."],
    ["Recall", "Share of all target moves this pattern caught."],
    ["FPR", "False positive rate — share of non-move days that still fired the pattern."],
    ["Lift", "Precision ÷ base rate — predictive edge over the unconditional probability."],
    ["Quality", "Robust = stable in/out-of-sample. Overfit = flagged for in-sample over-precision."],
    ["p", "Two-sided p-value vs base rate. 'sig' = passes significance and lift thresholds with adequate sample."],
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

function EmptyState({
  running,
  phase,
  onRefresh,
}: {
  running: boolean;
  phase: string | null | undefined;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-10 rounded-xl border border-border bg-card p-10 text-center">
      <BrainCircuit className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 font-display text-lg font-semibold text-foreground">
        {running ? "Discovery in progress…" : "No patterns yet"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {running
          ? `The engine is ${(phase ?? "working").toLowerCase()}. This first full run scores ~184k snapshots and tens of thousands of combinations — it can take a few minutes. Refresh shortly.`
          : "The discovery engine has not produced patterns yet. It runs in the background and refreshes monthly."}
      </p>
      <button
        onClick={onRefresh}
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>
  );
}
