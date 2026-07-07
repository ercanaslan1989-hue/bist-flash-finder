import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Gauge,
  Loader2,
  Play,
  Save,
  Square,
  Target,
  Trophy,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { fmtNum, fmtPct } from "@/lib/format";
import {
  BacktestEngine,
  DEFAULT_STRATEGIES,
  DEFAULT_PARAMS,
  HORIZONS,
  generateReport,
  loadBacktestData,
  fetchLatestSnapshotDate,
  saveBacktestResult,
  fetchRuns,
  type BacktestParams,
  type BacktestProgress,
  type BacktestResult,
  type Horizon,
  type Prediction,
  BacktestAbortError,
} from "@/lib/backtest";

export const Route = createFileRoute("/backtest-lab")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Backtest Motoru — Strateji Simülasyonu | BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "Skorlama stratejilerini geçmiş BIST verisiyle look-ahead bias olmadan simüle eden bağımsız backtest motoru: isabet oranı, getiri dağılımı, profit factor, Sharpe ve strateji karşılaştırması.",
      },
      { property: "og:title", content: "Backtest Motoru — BIST Sinyal Lab" },
      {
        property: "og:description",
        content: "Eski AI vs yeni Final Score stratejilerinin geçmiş performans karşılaştırması.",
      },
    ],
  }),
  component: BacktestLabPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Backtest motoru yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Sayfa bulunamadı.</p>
    </AppShell>
  ),
});

const isoMinusDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const engine = new BacktestEngine(DEFAULT_STRATEGIES);

function BacktestLabPage() {
  const latest = useQuery({
    queryKey: ["backtest-latest-date"],
    queryFn: fetchLatestSnapshotDate,
    staleTime: 60 * 60_000,
  });
  const runs = useQuery({
    queryKey: ["backtest-runs"],
    queryFn: () => fetchRuns(20),
    staleTime: 60_000,
  });

  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [datesInit, setDatesInit] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "loading" | "computing">("idle");
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(5);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const abortRef = useRef<AbortController | null>(null);

  // Initialise date range from the latest snapshot once available.
  if (latest.data && !datesInit) {
    setParams((p) => ({
      ...p,
      endDate: latest.data!,
      startDate: isoMinusDays(latest.data!, 120),
    }));
    setDatesInit(true);
  }

  const report = useMemo(() => (result ? generateReport(result) : null), [result]);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const activeStrategyId = selectedStrategy ?? report?.best?.strategyId ?? null;
  const activeStrategy = result?.strategies.find((s) => s.strategyId === activeStrategyId) ?? null;

  async function handleRun() {
    setError(null);
    setResult(null);
    setSaveState("idle");
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setPhase("loading");
      setProgress(null);
      const universe = await loadBacktestData(params, { signal: controller.signal });
      if (controller.signal.aborted) throw new BacktestAbortError();
      setPhase("computing");
      const res = await engine.run(universe, params, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(res);
      setHorizon(res.primaryHorizon);
      setSelectedStrategy(null);
    } catch (e) {
      if (e instanceof BacktestAbortError) setError("Backtest durduruldu.");
      else setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setRunning(false);
      setPhase("idle");
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleSave() {
    if (!result) return;
    setSaveState("saving");
    try {
      const label = `${params.startDate} → ${params.endDate} · min ${params.minScore}`;
      await saveBacktestResult(result, label);
      setSaveState("saved");
      runs.refetch();
    } catch {
      setSaveState("idle");
      setError("Sonuç kaydedilemedi.");
    }
  }

  const best = report?.best ?? null;

  return (
    <AppShell>
      <section>
        <div className="flex items-center gap-2 text-primary">
          <BarChart3 className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Backtest Motoru</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-foreground sm:text-3xl">
          Strateji Backtest Simülasyonu
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Skorlama stratejileri geçmiş günlük veriyle yeniden oynatılır. Her işlem gününde skor
          yalnızca o güne kadarki veriden hesaplanır (look-ahead bias engellenmiştir); AL sinyalleri
          1, 3, 5, 10 ve 20 işlem günü sonrası getirilere göre ölçülür. Canlı sistem etkilenmez.
        </p>
      </section>

      {/* Controls */}
      <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Başlangıç</span>
            <input
              type="date"
              value={params.startDate}
              max={params.endDate}
              onChange={(e) => setParams((p) => ({ ...p, startDate: e.target.value }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Bitiş</span>
            <input
              type="date"
              value={params.endDate}
              max={latest.data ?? undefined}
              onChange={(e) => setParams((p) => ({ ...p, endDate: e.target.value }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Min. Skor: {params.minScore}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={params.minScore}
              onChange={(e) => setParams((p) => ({ ...p, minScore: Number(e.target.value) }))}
              className="mt-2 accent-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Hedef (%): {params.target}
            </span>
            <input
              type="range"
              min={3}
              max={25}
              step={1}
              value={params.target}
              onChange={(e) => setParams((p) => ({ ...p, target: Number(e.target.value) }))}
              className="mt-2 accent-primary"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!running ? (
            <Button onClick={handleRun} disabled={!params.startDate || !params.endDate}>
              <Play className="h-4 w-4" /> Backtest'i Çalıştır
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4" /> Durdur
            </Button>
          )}
          {result && !running ? (
            <Button variant="secondary" onClick={handleSave} disabled={saveState === "saving"}>
              {saveState === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveState === "saved" ? "Kaydedildi" : "Sonucu Kaydet"}
            </Button>
          ) : null}
          {running ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "loading"
                ? "Geçmiş veri yükleniyor…"
                : `Hesaplanıyor… ${progress?.percent ?? 0}% · ${fmtNum(progress?.signals ?? 0)} sinyal`}
            </div>
          ) : null}
        </div>

        {running && phase === "computing" ? (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {result && report ? (
        <>
          {/* Headline stats */}
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="En İyi İsabet"
              value={fmtPct(best?.metrics.hitRate ?? null, 1)}
              sub={best ? best.strategyLabel : "—"}
              icon={<Target className="h-4 w-4" />}
              accent="success"
            />
            <StatCard
              label="Toplam Sinyal"
              value={fmtNum(result.totalSignals)}
              sub={`${result.universeSize} hisse`}
              icon={<Activity className="h-4 w-4" />}
            />
            <StatCard
              label="En İyi Ort. Getiri"
              value={fmtPct(best?.metrics.avgReturn ?? null, 2)}
              sub={`${horizon} gün ufku`}
              icon={<Gauge className="h-4 w-4" />}
              accent="primary"
            />
            <StatCard
              label="Kazanan Strateji"
              value={best ? best.strategyLabel : "—"}
              sub={report.summary}
              icon={<Trophy className="h-4 w-4" />}
              accent="accent"
            />
          </section>

          {/* Horizon selector */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Ufuk:</span>
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  h === horizon
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {h} gün
              </button>
            ))}
          </div>

          {/* Strategy comparison */}
          <StrategyComparison result={result} horizon={horizon} bestId={best?.strategyId ?? null} />

          {/* Charts */}
          {activeStrategy ? (
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <ReturnDistribution
                predictions={activeStrategy.predictions}
                horizon={horizon}
                label={activeStrategy.strategyLabel}
              />
              <MonthlySuccess
                predictions={activeStrategy.predictions}
                horizon={horizon}
                label={activeStrategy.strategyLabel}
              />
            </section>
          ) : null}

          {/* Strategy picker for detail views */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Detay stratejisi:
            </span>
            {result.strategies.map((s) => (
              <button
                key={s.strategyId}
                type="button"
                onClick={() => setSelectedStrategy(s.strategyId)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  s.strategyId === activeStrategyId
                    ? "bg-secondary text-foreground"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.strategyLabel}
              </button>
            ))}
          </div>

          {/* Recent 100 predictions */}
          {activeStrategy ? (
            <RecentPredictions
              predictions={activeStrategy.predictions}
              horizon={horizon}
              label={activeStrategy.strategyLabel}
            />
          ) : null}
        </>
      ) : null}

      {/* Run history */}
      <RunHistory runs={runs.data ?? []} loading={runs.isLoading} />

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Yalnızca araştırma amaçlıdır — yatırım tavsiyesi değildir. Backtest sonuçları geçmiş veriye
        dayanır ve gelecekteki performansı garanti etmez.
      </p>
    </AppShell>
  );
}

// ===== Strategy comparison table =====

function StrategyComparison({
  result,
  horizon,
  bestId,
}: {
  result: BacktestResult;
  horizon: Horizon;
  bestId: string | null;
}) {
  const rows = [...result.strategies].sort(
    (a, b) => (b.metrics[horizon].hitRate ?? -1) - (a.metrics[horizon].hitRate ?? -1),
  );
  const pf = (x: number | null) =>
    x == null ? "—" : x === Infinity ? "∞" : `${x.toFixed(2)}×`;

  return (
    <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Strateji</th>
            <th className="px-4 py-3 text-right">Sinyal</th>
            <th className="px-4 py-3 text-right">İsabet</th>
            <th className="px-4 py-3 text-right">Ort. Getiri</th>
            <th className="px-4 py-3 text-right">Medyan</th>
            <th className="px-4 py-3 text-right">Profit F.</th>
            <th className="px-4 py-3 text-right">Maks. DD</th>
            <th className="px-4 py-3 text-right">Sharpe</th>
            <th className="px-4 py-3 text-right">Ort. Süre</th>
            <th className="px-4 py-3 text-right">En İyi/Kötü Seri</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const m = s.metrics[horizon];
            const isBest = s.strategyId === bestId;
            return (
              <tr
                key={s.strategyId}
                className={`border-b border-border/60 ${isBest ? "bg-success/5" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {isBest ? <Trophy className="mr-1 inline h-3.5 w-3.5 text-accent" /> : null}
                  {s.strategyLabel}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular">{fmtNum(m.signals)}</td>
                <td className="px-4 py-3 text-right font-mono tabular text-foreground">
                  {fmtPct(m.hitRate, 1)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono tabular ${
                    (m.avgReturn ?? 0) >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {fmtPct(m.avgReturn, 2)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular">{fmtPct(m.medianReturn, 2)}</td>
                <td className="px-4 py-3 text-right font-mono tabular">{pf(m.profitFactor)}</td>
                <td className="px-4 py-3 text-right font-mono tabular text-destructive">
                  {fmtPct(m.maxDrawdown, 1)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular">
                  {m.sharpe == null ? "—" : m.sharpe.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular">
                  {m.avgHolding == null ? "—" : `${m.avgHolding.toFixed(1)}g`}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular text-muted-foreground">
                  {m.bestStreak}/{m.worstStreak}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ===== Return distribution histogram =====

const BINS = [
  { min: -Infinity, max: -20, label: "≤-20" },
  { min: -20, max: -10, label: "-20…-10" },
  { min: -10, max: -5, label: "-10…-5" },
  { min: -5, max: 0, label: "-5…0" },
  { min: 0, max: 5, label: "0…5" },
  { min: 5, max: 10, label: "5…10" },
  { min: 10, max: 20, label: "10…20" },
  { min: 20, max: Infinity, label: "≥20" },
];

function retAt(p: Prediction, h: Horizon): number | null {
  return h === 1 ? p.ret1d : h === 3 ? p.ret3d : h === 5 ? p.ret5d : h === 10 ? p.ret10d : p.ret20d;
}

function ReturnDistribution({
  predictions,
  horizon,
  label,
}: {
  predictions: Prediction[];
  horizon: Horizon;
  label: string;
}) {
  const returns = predictions
    .map((p) => retAt(p, horizon))
    .filter((r): r is number => r != null);
  const counts = BINS.map((b) => returns.filter((r) => r > b.min && r <= b.max).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-display text-sm font-semibold text-foreground">
        Getiri Dağılımı — {label}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {horizon} gün sonrası getirilerin dağılımı ({fmtNum(returns.length)} sinyal)
      </p>
      <div className="mt-4 space-y-1.5">
        {BINS.map((b, i) => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              {b.label}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-secondary/40">
              <div
                className={`h-full rounded ${b.max <= 0 ? "bg-destructive/70" : "bg-success/70"}`}
                style={{ width: `${(counts[i] / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 font-mono text-[11px] text-muted-foreground">
              {counts[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Monthly success rate =====

function MonthlySuccess({
  predictions,
  horizon,
  label,
}: {
  predictions: Prediction[];
  horizon: Horizon;
  label: string;
}) {
  const byMonth = new Map<string, { hit: number; n: number }>();
  for (const p of predictions) {
    const r = retAt(p, horizon);
    if (r == null) continue;
    const key = p.signalDate.slice(0, 7);
    const a = byMonth.get(key) ?? { hit: 0, n: 0 };
    a.n += 1;
    if (r > 0) a.hit += 1;
    byMonth.set(key, a);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-display text-sm font-semibold text-foreground">
        Aylık Başarı Oranı — {label}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Her ay pozitif kapanan {horizon} günlük sinyallerin oranı
      </p>
      <div className="mt-4 flex h-40 items-end gap-1">
        {months.length === 0 ? (
          <span className="text-xs text-muted-foreground">Veri yok</span>
        ) : (
          months.map(([key, a]) => {
            const rate = a.n ? (a.hit / a.n) * 100 : 0;
            return (
              <div key={key} className="flex flex-1 flex-col items-center gap-1" title={`${key}: %${rate.toFixed(0)} (${a.n})`}>
                <div className="flex h-32 w-full items-end">
                  <div
                    className={`w-full rounded-t ${rate >= 50 ? "bg-success/70" : "bg-warning/70"}`}
                    style={{ height: `${rate}%` }}
                  />
                </div>
                <span className="rotate-0 truncate text-[9px] text-muted-foreground">
                  {key.slice(2)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ===== Recent 100 predictions =====

function RecentPredictions({
  predictions,
  horizon,
  label,
}: {
  predictions: Prediction[];
  horizon: Horizon;
  label: string;
}) {
  const rows = [...predictions]
    .sort((a, b) => b.signalDate.localeCompare(a.signalDate))
    .slice(0, 100);

  return (
    <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Son 100 Öneri — {label}
        </h3>
      </div>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5">Tarih</th>
            <th className="px-4 py-2.5">Hisse</th>
            <th className="px-4 py-2.5 text-right">Skor</th>
            <th className="px-4 py-2.5 text-right">{horizon}g Getiri</th>
            <th className="px-4 py-2.5 text-right">Maks.</th>
            <th className="px-4 py-2.5 text-center">Sonuç</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const r = retAt(p, horizon);
            return (
              <tr key={`${p.symbol}-${p.signalDate}-${i}`} className="border-b border-border/50">
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.signalDate}</td>
                <td className="px-4 py-2.5 font-medium text-foreground">{p.symbol}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular">{fmtNum(p.score)}</td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular ${
                    r == null ? "text-muted-foreground" : r >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {r == null ? "bekliyor" : fmtPct(r, 2)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular text-muted-foreground">
                  {fmtPct(p.maxRet, 1)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      p.hit
                        ? "bg-success/15 text-success"
                        : "bg-secondary/60 text-muted-foreground"
                    }`}
                  >
                    {p.hit ? `hedef ${p.daysToHit}g` : "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ===== Run history =====

function RunHistory({
  runs,
  loading,
}: {
  runs: { id: string; label: string | null; created_at: string; total_predictions: number | null; universe_size: number | null }[];
  loading: boolean;
}) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-display text-sm font-semibold text-foreground">Geçmiş Çalıştırmalar</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Kaydedilen tüm backtest sonuçları kalıcıdır (silinmez).
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Yükleniyor…</p>
      ) : runs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Henüz kaydedilmiş çalıştırma yok.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {runs.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="truncate text-foreground">{r.label ?? "Etiketsiz"}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {fmtNum(r.total_predictions ?? 0)} sinyal · {new Date(r.created_at).toLocaleDateString("tr-TR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
