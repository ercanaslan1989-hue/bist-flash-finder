import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Layers, Loader2, Play, Save, Square, Trophy, Gauge, Target, Cpu, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { fmtNum, fmtPct } from "@/lib/format";
import {
  buildDataset,
  fetchLatestSnapshotDate,
  timeSeriesSplit,
  trainModel,
  selectFeatures,
  defaultConfig,
  ModelServer,
  fitServingStacker,
  saveEnsemble,
  setActiveEnsemble,
  fetchEnsembles,
  DEFAULT_MODEL_TYPES,
  ML_HORIZONS,
  MlAbortError,
  runAutoOptimization,
  buildBestCharts,
  type DatasetParams,
  type MlHorizon,
  type MlProgress,
  type BlendMetrics,
  type EnsembleMethod,
  type ServingChallenger,
  type ServingConfig,
  type StoredEnsemble,
  type TrainedModel,
  type AutoRunOutput,
  type BestCharts,
} from "@/lib/ml";

export const Route = createFileRoute("/ensemble-lab")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ensemble Lab — Şampiyon + Challenger Birleştirme | BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "Kural Motoru (Şampiyon) ile ML Challenger modellerini kontrollü şekilde birleştiren bağımsız ensemble & model servisleme katmanı. Ağırlıklı, sıralama, lojistik yığın ve geçişli yöntemleri karşılaştırın. Look-ahead bias yoktur; canlı sistem etkilenmez.",
      },
      { property: "og:title", content: "Ensemble Lab — BIST Sinyal Lab" },
      {
        property: "og:description",
        content: "Şampiyon vs Ensemble performansı: ağırlıklı, rank, lojistik stacking ve gated birleştirme.",
      },
    ],
  }),
  component: EnsembleLabPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Ensemble Lab yüklenemedi</h2>
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

const METHODS: { method: EnsembleMethod; label: string }[] = [
  { method: "weighted", label: "Ağırlıklı Ortalama" },
  { method: "rank", label: "Sıralama (Rank)" },
  { method: "logistic", label: "Lojistik Yığın" },
  { method: "gated", label: "Geçişli (Gated)" },
  { method: "max", label: "En İyimser (Max)" },
];

interface MethodResult {
  method: EnsembleMethod;
  label: string;
  metrics: BlendMetrics;
}

interface RunOutput {
  championOnly: BlendMetrics;
  methods: MethodResult[];
  logisticWeights: number[];
  challengerLabels: string[];
  testN: number;
}

function EnsembleLabPage() {
  const latest = useQuery({
    queryKey: ["ml-latest-date"],
    queryFn: fetchLatestSnapshotDate,
    staleTime: 60 * 60_000,
  });
  const saved = useQuery({
    queryKey: ["ensembles"],
    queryFn: () => fetchEnsembles(20),
    staleTime: 60_000,
  });

  const [params, setParams] = useState<DatasetParams>({
    startDate: "",
    endDate: "",
    warmup: 50,
    upThreshold: 0,
  });
  const [horizon, setHorizon] = useState<MlHorizon>(5);
  const [championWeight, setChampionWeight] = useState(1);
  const [threshold, setThreshold] = useState(0.5);
  const [gate, setGate] = useState(0.6);
  const [method, setMethod] = useState<EnsembleMethod>("logistic");
  const [datesInit, setDatesInit] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState<MlProgress | null>(null);
  const [out, setOut] = useState<RunOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const challengersRef = useRef<ServingChallenger[]>([]);

  // Auto-optimisation state
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoPhase, setAutoPhase] = useState("");
  const [autoProgress, setAutoProgress] = useState<{ processed: number; total: number; percent: number } | null>(
    null,
  );
  const [autoDatasetProgress, setAutoDatasetProgress] = useState<MlProgress | null>(null);
  const [autoOut, setAutoOut] = useState<AutoRunOutput | null>(null);
  const [autoCharts, setAutoCharts] = useState<BestCharts | null>(null);
  const [autoSavedId, setAutoSavedId] = useState<string | null>(null);
  const autoAbortRef = useRef<AbortController | null>(null);

  if (latest.data && !datesInit) {
    setParams((p) => ({ ...p, endDate: latest.data!, startDate: isoMinusDays(latest.data!, 400) }));
    setDatesInit(true);
  }

  function serverFor(m: EnsembleMethod, logisticWeights: number[]): ModelServer {
    const cfg: ServingConfig = {
      method: m,
      horizon,
      threshold,
      championWeight,
      gateConfidence: gate,
      logisticWeights: m === "logistic" ? logisticWeights : undefined,
    };
    return new ModelServer(cfg, challengersRef.current);
  }

  async function handleRun() {
    setError(null);
    setOut(null);
    setSaveState("idle");
    setRunning(true);
    challengersRef.current = [];
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setPhase("Feature Store verisi hazırlanıyor…");
      setProgress(null);
      const samples = await buildDataset(params, { signal: controller.signal, onProgress: setProgress });
      if (controller.signal.aborted) throw new MlAbortError();
      if (samples.length < 200) throw new Error("Yeterli örnek yok. Tarih aralığını genişletin.");

      const split = timeSeriesSplit(samples, 0.6, 0.2);
      const selected = selectFeatures(split.train);

      const challengers: ServingChallenger[] = [];
      for (const type of DEFAULT_MODEL_TYPES) {
        setPhase(`${type.toUpperCase()} Challenger eğitiliyor…`);
        await new Promise((r) => setTimeout(r, 0));
        const model: TrainedModel = trainModel(split.train, {
          config: defaultConfig(type),
          horizon,
          upThreshold: params.upThreshold,
          featureNames: selected,
        });
        challengers.push({ id: type, label: model.label, weight: 1, model });
      }
      challengersRef.current = challengers;

      setPhase("Ensemble değerlendiriliyor…");
      await new Promise((r) => setTimeout(r, 0));
      const logisticWeights = fitServingStacker(split.train, challengers, horizon);

      const championOnly = new ModelServer(
        { method: "weighted", horizon, threshold, championWeight: 1 },
        [],
      ).evaluate(split.test);

      const methods = METHODS.map((m) => ({
        method: m.method,
        label: m.label,
        metrics: serverFor(m.method, logisticWeights).evaluate(split.test),
      }));

      setOut({
        championOnly,
        methods,
        logisticWeights,
        challengerLabels: challengers.map((c) => c.label),
        testN: split.test.filter((s) => s.labels[horizon].up != null).length,
      });
    } catch (e) {
      if (e instanceof MlAbortError) setError("İşlem durduruldu.");
      else setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setRunning(false);
      setPhase("");
      abortRef.current = null;
    }
  }

  async function handleSave() {
    if (!out) return;
    const selectedResult = out.methods.find((m) => m.method === method);
    if (!selectedResult) return;
    setSaveState("saving");
    try {
      await saveEnsemble({
        name: `${METHODS.find((m) => m.method === method)?.label} • ${horizon}g`,
        config: {
          method,
          horizon,
          threshold,
          championWeight,
          gateConfidence: gate,
          logisticWeights: method === "logistic" ? out.logisticWeights : undefined,
        },
        memberModelIds: [],
        metrics: selectedResult.metrics,
        testSamples: out.testN,
        notes: `Champion + ${out.challengerLabels.join(", ")}`,
      });
      setSaveState("saved");
      saved.refetch();
    } catch {
      setSaveState("idle");
      setError("Ensemble kaydedilemedi.");
    }
  }

  async function handleAutoOptimize() {
    setError(null);
    setAutoOut(null);
    setAutoCharts(null);
    setAutoSavedId(null);
    setAutoProgress(null);
    setAutoDatasetProgress(null);
    setAutoRunning(true);
    const controller = new AbortController();
    autoAbortRef.current = controller;
    try {
      const output = await runAutoOptimization(params, horizon, {
        signal: controller.signal,
        onPhase: setAutoPhase,
        onDatasetProgress: setAutoDatasetProgress,
        onProgress: setAutoProgress,
      });
      const charts = buildBestCharts(output.best, output.bestArtifacts);
      setAutoOut(output);
      setAutoCharts(charts);

      // Auto-save the F1-best combo as the active "Şampiyon Ensemble".
      try {
        const cfg: ServingConfig = {
          method: output.best.combo.method,
          horizon,
          threshold: output.best.combo.decisionThreshold,
          championWeight: output.best.combo.championWeight,
          gateConfidence: output.best.combo.gateConfidence,
          logisticWeights:
            output.best.combo.method === "logistic" ? output.bestArtifacts.logisticWeights ?? undefined : undefined,
        };
        const blendMetrics: BlendMetrics = {
          signals: output.best.metrics.totalTrades,
          precision: output.best.metrics.precision,
          avgReturn: output.best.metrics.avgReturn,
          hitRate: output.best.metrics.winRate,
        };
        const id = await saveEnsemble({
          name: `Auto Şampiyon • ${horizon}g • %${output.best.combo.upThreshold} • ${output.best.combo.method}`,
          config: cfg,
          memberModelIds: [],
          metrics: blendMetrics,
          testSamples: output.bestArtifacts.testSamples,
          notes: `Otomatik optimizasyon • F1 ${output.best.metrics.f1.toFixed(3)} • ${output.totalCombos} kombinasyon`,
        });
        if (id) {
          await setActiveEnsemble(id, horizon);
          setAutoSavedId(id);
          saved.refetch();
        }
      } catch {
        // Non-blocking: results still shown.
      }
    } catch (e) {
      if (e instanceof MlAbortError) setError("Otomatik optimizasyon durduruldu.");
      else setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setAutoRunning(false);
      setAutoPhase("");
      autoAbortRef.current = null;
    }
  }

  const selected = useMemo(
    () => out?.methods.find((m) => m.method === method) ?? null,
    [out, method],
  );
  const best = useMemo(() => {
    if (!out) return null;
    return [...out.methods].sort((a, b) => (b.metrics.precision ?? 0) - (a.metrics.precision ?? 0))[0];
  }, [out]);

  const beatsChampion =
    selected && out ? (selected.metrics.precision ?? 0) > (out.championOnly.precision ?? 0) : false;

  return (
    <AppShell>
      <section>
        <div className="flex items-center gap-2 text-primary">
          <Layers className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Ensemble Lab</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-foreground sm:text-3xl">
          Ensemble &amp; Model Servisleme
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Kural Motoru (<strong>Şampiyon</strong>) ile ML <strong>Challenger</strong> modelleri
          kontrollü şekilde birleştirilir. Şampiyon her zaman kendi ağırlığıyla bir üye olarak kalır;
          hiçbir yöntem canlı sinyali sessizce devre dışı bırakamaz. Lojistik yığın (stacking)
          ağırlıkları yalnızca eğitim bölümünde öğrenilir ve değişmeden test bölümüne uygulanır —
          look-ahead bias yoktur. Hiçbir ensemble otomatik olarak canlıya alınmaz.
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
              Ufuk: {horizon} gün
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {ML_HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    h === horizon
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {h}g
                </button>
              ))}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Etiket eşiği (%): {params.upThreshold}
            </span>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={params.upThreshold}
              onChange={(e) => setParams((p) => ({ ...p, upThreshold: Number(e.target.value) }))}
              className="mt-2 accent-primary"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Şampiyon ağırlığı: {championWeight.toFixed(1)}×
            </span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={championWeight}
              onChange={(e) => setChampionWeight(Number(e.target.value))}
              className="mt-2 accent-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Karar eşiği: {threshold.toFixed(2)}
            </span>
            <input
              type="range"
              min={0.3}
              max={0.8}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-2 accent-primary"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Gated güven eşiği: {gate.toFixed(2)}
            </span>
            <input
              type="range"
              min={0.2}
              max={0.9}
              step={0.05}
              value={gate}
              onChange={(e) => setGate(Number(e.target.value))}
              className="mt-2 accent-primary"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!running ? (
            <Button onClick={handleRun} disabled={!params.startDate || !params.endDate}>
              <Play className="h-4 w-4" /> Ensemble Çalıştır
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => abortRef.current?.abort()}>
              <Square className="h-4 w-4" /> Durdur
            </Button>
          )}
          {out && !running ? (
            <Button variant="secondary" onClick={handleSave} disabled={saveState === "saving"}>
              {saveState === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveState === "saved" ? "Kaydedildi" : "Seçili Ensemble'ı Kaydet"}
            </Button>
          ) : null}
          {running ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase}
              {progress ? ` ${progress.percent}%` : ""}
            </div>
          ) : null}
          {!autoRunning ? (
            <Button
              variant="outline"
              onClick={handleAutoOptimize}
              disabled={running || !params.startDate || !params.endDate}
            >
              <Sparkles className="h-4 w-4" /> Otomatik Optimizasyon
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => autoAbortRef.current?.abort()}>
              <Square className="h-4 w-4" /> Otomatik Durdur
            </Button>
          )}
          {autoRunning ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {autoPhase}
              {autoProgress ? ` • ${autoProgress.percent}% (${autoProgress.processed}/${autoProgress.total})` : ""}
              {autoDatasetProgress && !autoProgress ? ` • ${autoDatasetProgress.percent}%` : ""}
            </div>
          ) : null}
        </div>

        {autoRunning && (autoProgress || autoDatasetProgress) ? (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${autoProgress?.percent ?? autoDatasetProgress?.percent ?? 0}%` }}
            />
          </div>
        ) : null}

        {running && progress ? (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {out && best && selected ? (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="En İyi Yöntem"
              value={best.label}
              sub={`Precision ${(best.metrics.precision ?? 0).toFixed(3)}`}
              icon={<Gauge className="h-4 w-4" />}
              accent="primary"
            />
            <StatCard
              label="Ensemble vs Şampiyon"
              value={beatsChampion ? "Ensemble" : "Şampiyon"}
              sub={`${(selected.metrics.precision ?? 0).toFixed(3)} vs ${(out.championOnly.precision ?? 0).toFixed(3)}`}
              icon={<Trophy className="h-4 w-4" />}
              accent="accent"
            />
            <StatCard
              label="Ort. Getiri (seçili)"
              value={fmtPct(selected.metrics.avgReturn, 2)}
              sub={`İsabet ${fmtNum(selected.metrics.hitRate, 1)}%`}
              icon={<Target className="h-4 w-4" />}
              accent="success"
            />
            <StatCard
              label="Test Sinyali"
              value={fmtNum(selected.metrics.signals)}
              sub={`${fmtNum(out.testN)} yerleşmiş örnek`}
              icon={<Cpu className="h-4 w-4" />}
            />
          </section>

          {/* Method comparison */}
          <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Birleştirme Yöntemi</th>
                  <th className="px-4 py-3 text-right">Precision</th>
                  <th className="px-4 py-3 text-right">Ort. Getiri</th>
                  <th className="px-4 py-3 text-right">İsabet</th>
                  <th className="px-4 py-3 text-right">Sinyal</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60 bg-secondary/20">
                  <td className="px-4 py-3 font-medium text-foreground">Yalnızca Şampiyon (Kural Motoru)</td>
                  <td className="px-4 py-3 text-right font-mono tabular">
                    {(out.championOnly.precision ?? 0).toFixed(3)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular ${
                      (out.championOnly.avgReturn ?? 0) >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {fmtPct(out.championOnly.avgReturn, 2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular">
                    {fmtNum(out.championOnly.hitRate, 1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular">{fmtNum(out.championOnly.signals)}</td>
                </tr>
                {out.methods.map((r) => {
                  const wins = (r.metrics.precision ?? 0) > (out.championOnly.precision ?? 0);
                  return (
                    <tr
                      key={r.method}
                      onClick={() => setMethod(r.method)}
                      className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-secondary/40 ${
                        r.method === method ? "bg-secondary/50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {r.label}
                        {r.method === method ? (
                          <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                            seçili
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono tabular ${
                          wins ? "text-success" : "text-foreground"
                        }`}
                      >
                        {(r.metrics.precision ?? 0).toFixed(3)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono tabular ${
                          (r.metrics.avgReturn ?? 0) >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {fmtPct(r.metrics.avgReturn, 2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular">{fmtNum(r.metrics.hitRate, 1)}%</td>
                      <td className="px-4 py-3 text-right font-mono tabular">{fmtNum(r.metrics.signals)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Member weights */}
          <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
            <h2 className="font-display text-sm font-semibold text-foreground">Üye Ağırlıkları</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {method === "logistic"
                ? "Lojistik yığın ağırlıkları (eğitim bölümünde öğrenildi). Pozitif ağırlık = üyenin sinyali kararı yukarı iter."
                : "Bu yöntemde Şampiyon ağırlığı ayarlanabilir; her Challenger 1× ağırlıkla katılır."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {method === "logistic" ? (
                <>
                  <WeightChip label="Sabit (bias)" value={out.logisticWeights[0]} />
                  <WeightChip label="Şampiyon" value={out.logisticWeights[1]} />
                  {out.challengerLabels.map((lbl, i) => (
                    <WeightChip key={lbl} label={lbl} value={out.logisticWeights[i + 2]} />
                  ))}
                </>
              ) : (
                <>
                  <WeightChip label="Şampiyon" value={championWeight} />
                  {out.challengerLabels.map((lbl) => (
                    <WeightChip key={lbl} label={lbl} value={1} />
                  ))}
                </>
              )}
            </div>
          </section>
        </>
      ) : null}

      {autoOut && autoCharts ? (
        <AutoOptimizationResults
          output={autoOut}
          charts={autoCharts}
          horizon={horizon}
          savedId={autoSavedId}
        />
      ) : null}

      <SavedEnsembles rows={saved.data ?? []} loading={saved.isLoading} onActivated={() => saved.refetch()} />

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Yalnızca araştırma amaçlıdır — yatırım tavsiyesi değildir. Ensemble yalnızca ölçüm ve
        karşılaştırma yapar; canlı öneriler Kural Motoru (Şampiyon) ile üretilmeye devam eder.
      </p>
    </AppShell>
  );
}

function WeightChip({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular font-semibold ${positive ? "text-success" : "text-destructive"}`}>
        {value >= 0 ? "+" : ""}
        {value.toFixed(3)}
      </span>
    </span>
  );
}

function SavedEnsembles({
  rows,
  loading,
  onActivated,
}: {
  rows: StoredEnsemble[];
  loading: boolean;
  onActivated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function activate(row: StoredEnsemble) {
    setBusy(row.id);
    try {
      await setActiveEnsemble(row.id, row.horizon);
      onActivated();
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-foreground">Kayıtlı Ensemble'lar</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Bir ensemble'ı "aktif" işaretlemek yalnızca kayıt amaçlıdır; canlı sistemi değiştirmez.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Ad</th>
              <th className="px-4 py-3">Yöntem</th>
              <th className="px-4 py-3 text-right">Ufuk</th>
              <th className="px-4 py-3 text-right">Precision</th>
              <th className="px-4 py-3 text-right">Ort. Getiri</th>
              <th className="px-4 py-3 text-right">Sinyal</th>
              <th className="px-4 py-3 text-right">Durum</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Yükleniyor…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Henüz kayıtlı ensemble yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.method}</td>
                  <td className="px-4 py-3 text-right font-mono tabular">{r.horizon}g</td>
                  <td className="px-4 py-3 text-right font-mono tabular">
                    {r.precision != null ? r.precision.toFixed(3) : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular ${
                      (r.avg_return ?? 0) >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {fmtPct(r.avg_return, 2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular">{fmtNum(r.signals)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.is_active ? (
                      <span className="rounded bg-success/15 px-2 py-1 text-[11px] font-medium text-success">
                        Aktif
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => activate(r)}
                        disabled={busy === r.id}
                        className="rounded bg-secondary px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-secondary/70 disabled:opacity-50"
                      >
                        {busy === r.id ? "…" : "Aktif yap"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// Auto-optimisation results — top-20 table, summary and diagnostic charts.
// ============================================================================

function AutoOptimizationResults({
  output,
  charts,
  horizon,
  savedId,
}: {
  output: AutoRunOutput;
  charts: BestCharts;
  horizon: MlHorizon;
  savedId: string | null;
}) {
  const best = output.best;
  const top20F1 = output.results.slice(0, 20);
  const top20RAR = output.byRiskAdjusted.slice(0, 20);
  const [tab, setTab] = useState<"f1" | "rar">("f1");
  const rows = tab === "f1" ? top20F1 : top20RAR;
  const seconds = (output.elapsedMs / 1000).toFixed(1);

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">Otomatik Optimizasyon Sonuçları</span>
      </div>
      <h2 className="mt-2 font-display text-xl font-bold text-foreground sm:text-2xl">Şampiyon Ensemble Adayı</h2>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="En İyi F1"
          value={best.metrics.f1.toFixed(3)}
          sub={`Accuracy ${best.metrics.accuracy.toFixed(3)}`}
          icon={<Trophy className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Beklenen Ort. Getiri"
          value={fmtPct(best.metrics.avgReturn, 2)}
          sub={`Sharpe ${best.metrics.sharpe != null ? best.metrics.sharpe.toFixed(2) : "—"}`}
          icon={<Target className="h-4 w-4" />}
          accent={(best.metrics.avgReturn ?? 0) >= 0 ? "success" : "accent"}
        />
        <StatCard
          label="Beklenen Max Düşüş"
          value={fmtPct(best.metrics.maxDrawdown, 2)}
          sub={`Kazanma ${fmtNum(best.metrics.winRate, 1)}%`}
          icon={<Gauge className="h-4 w-4" />}
          accent="accent"
        />
        <StatCard
          label="Kombinasyon"
          value={`${fmtNum(output.totalCombos)}`}
          sub={`${seconds} sn • ${best.metrics.totalTrades} işlem`}
          icon={<Cpu className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="font-display text-sm font-semibold text-foreground">En İyi Parametreler</h3>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <ParamChip label="Yöntem" value={best.combo.method} />
          <ParamChip label="Etiket eşiği" value={`%${best.combo.upThreshold}`} />
          <ParamChip label="Karar eşiği" value={best.combo.decisionThreshold.toFixed(2)} />
          <ParamChip label="Gated güven" value={best.combo.gateConfidence.toFixed(2)} />
          <ParamChip label="Şampiyon ağırlığı" value={`${best.combo.championWeight.toFixed(1)}×`} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {savedId
            ? "Bu kombinasyon 'Şampiyon Ensemble' olarak kaydedildi ve horizonu için aktif işaretlendi. Canlı öneriler Kural Motoru ile üretilmeye devam eder — bu bayrak yalnızca kayıt amaçlıdır."
            : "Otomatik kayıt başarısız oldu; sonuçlar aşağıda görüntüleniyor."}
        </p>
      </div>

      {/* Top-20 table */}
      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("f1")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "f1" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          En iyi 20 • F1
        </button>
        <button
          type="button"
          onClick={() => setTab("rar")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "rar" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
          }`}
        >
          En iyi 20 • Risk-Adj. Return
        </button>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1100px] text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border text-left uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3">#</th>
              <th className="px-3 py-3">Yöntem</th>
              <th className="px-3 py-3 text-right">Etiket</th>
              <th className="px-3 py-3 text-right">Karar</th>
              <th className="px-3 py-3 text-right">Gate</th>
              <th className="px-3 py-3 text-right">Champ W</th>
              <th className="px-3 py-3 text-right">F1</th>
              <th className="px-3 py-3 text-right">Acc</th>
              <th className="px-3 py-3 text-right">Prec</th>
              <th className="px-3 py-3 text-right">Rec</th>
              <th className="px-3 py-3 text-right">Ort.</th>
              <th className="px-3 py-3 text-right">Med.</th>
              <th className="px-3 py-3 text-right">Sharpe</th>
              <th className="px-3 py-3 text-right">MaxDD</th>
              <th className="px-3 py-3 text-right">Kaz%</th>
              <th className="px-3 py-3 text-right">PF</th>
              <th className="px-3 py-3 text-right">İşlem</th>
              <th className="px-3 py-3 text-right">R-Adj</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.combo.method}-${r.combo.upThreshold}-${r.combo.decisionThreshold}-${r.combo.gateConfidence}-${r.combo.championWeight}`}
                className={`border-b border-border/60 ${i === 0 ? "bg-primary/5" : ""}`}
              >
                <td className="px-3 py-2 font-mono tabular">{i + 1}</td>
                <td className="px-3 py-2 text-foreground">{r.combo.method}</td>
                <td className="px-3 py-2 text-right font-mono tabular">%{r.combo.upThreshold}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.combo.decisionThreshold.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.combo.gateConfidence.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.combo.championWeight.toFixed(1)}×</td>
                <td className="px-3 py-2 text-right font-mono tabular font-semibold text-foreground">
                  {r.metrics.f1.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.metrics.accuracy.toFixed(3)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.metrics.precision.toFixed(3)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.metrics.recall.toFixed(3)}</td>
                <td
                  className={`px-3 py-2 text-right font-mono tabular ${
                    (r.metrics.avgReturn ?? 0) >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {fmtPct(r.metrics.avgReturn, 2)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{fmtPct(r.metrics.medianReturn, 2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">
                  {r.metrics.sharpe != null ? r.metrics.sharpe.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular text-destructive">
                  {fmtPct(r.metrics.maxDrawdown, 2)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{fmtNum(r.metrics.winRate, 1)}%</td>
                <td className="px-3 py-2 text-right font-mono tabular">
                  {r.metrics.profitFactor != null && Number.isFinite(r.metrics.profitFactor)
                    ? r.metrics.profitFactor.toFixed(2)
                    : "∞"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular">{r.metrics.totalTrades}</td>
                <td className="px-3 py-2 text-right font-mono tabular">
                  {r.metrics.riskAdjusted != null ? r.metrics.riskAdjusted.toFixed(3) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Ort. bekleme süresi = {best.metrics.avgHoldDays} işlem günü (ufuk sabittir).
      </p>

      {/* Charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Equity Curve" subtitle="Kümülatif getiri (en iyi kombinasyon)">
          <LineChart data={charts.equityCurve} color="hsl(var(--primary))" showZero />
        </ChartCard>
        <ChartCard title="Drawdown Curve" subtitle="Kümülatif zirveden düşüş">
          <LineChart data={charts.drawdownCurve} color="hsl(var(--destructive))" fill />
        </ChartCard>
        <ChartCard title="ROC Curve" subtitle={`AUC ~ görsel`}>
          <LineChart data={charts.rocCurve} color="hsl(var(--primary))" square diagonal />
        </ChartCard>
        <ChartCard title="Precision-Recall Curve" subtitle="Recall → Precision">
          <LineChart data={charts.prCurve} color="hsl(var(--accent))" square />
        </ChartCard>
        <ChartCard title="Prediction Distribution" subtitle="Blended skor dağılımı (pozitif / negatif)">
          <PredictionHistogram data={charts.predictionHistogram} threshold={best.combo.decisionThreshold} />
        </ChartCard>
        <ChartCard title="Confusion Matrix" subtitle={`Karar eşiği ${best.combo.decisionThreshold.toFixed(2)}`}>
          <ConfusionMatrix c={charts.confusion} />
        </ChartCard>
        <div className="lg:col-span-2">
          <ChartCard title="Feature Importance" subtitle="Challenger modellerin toplam kazancı">
            <FeatureImportanceBars items={output.bestArtifacts.featureImportance.slice(0, 15)} />
          </ChartCard>
        </div>
      </div>
    </section>
  );
}

function ParamChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono tabular text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h4 className="font-display text-sm font-semibold text-foreground">{title}</h4>
        {subtitle ? <span className="text-[10px] uppercase text-muted-foreground">{subtitle}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LineChart({
  data,
  color,
  fill,
  square,
  diagonal,
  showZero,
}: {
  data: { x: number; y: number }[];
  color: string;
  fill?: boolean;
  square?: boolean;
  diagonal?: boolean;
  showZero?: boolean;
}) {
  const W = 320;
  const H = square ? 220 : 140;
  if (!data.length) return <div className="text-xs text-muted-foreground">Veri yok.</div>;
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(0, ...ys);
  const px = (x: number) => ((x - xMin) / (xMax - xMin || 1)) * (W - 24) + 12;
  const py = (y: number) => H - 12 - ((y - yMin) / (yMax - yMin || 1)) * (H - 24);
  const d = data.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const areaD =
    fill && data.length
      ? `${d} L${px(data[data.length - 1].x).toFixed(1)},${py(0).toFixed(1)} L${px(data[0].x).toFixed(1)},${py(0).toFixed(1)} Z`
      : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {showZero ? (
        <line x1={px(xMin)} x2={px(xMax)} y1={py(0)} y2={py(0)} stroke="hsl(var(--border))" strokeDasharray="2 3" />
      ) : null}
      {diagonal ? (
        <line
          x1={px(xMin)}
          y1={py(yMin)}
          x2={px(xMax)}
          y2={py(yMax)}
          stroke="hsl(var(--border))"
          strokeDasharray="2 3"
        />
      ) : null}
      {areaD ? <path d={areaD} fill={color} opacity={0.15} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

function PredictionHistogram({
  data,
  threshold,
}: {
  data: { bin: number; positives: number; negatives: number }[];
  threshold: number;
}) {
  const W = 320;
  const H = 160;
  const max = Math.max(1, ...data.map((d) => d.positives + d.negatives));
  const barW = (W - 24) / data.length;
  const thrX = threshold * (W - 24) + 12;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {data.map((d, i) => {
        const x = 12 + i * barW;
        const totalH = ((d.positives + d.negatives) / max) * (H - 24);
        const posH = ((d.positives) / max) * (H - 24);
        return (
          <g key={i}>
            <rect
              x={x + 1}
              y={H - 12 - totalH}
              width={Math.max(1, barW - 2)}
              height={totalH - posH}
              fill="hsl(var(--destructive))"
              opacity={0.55}
            />
            <rect
              x={x + 1}
              y={H - 12 - posH}
              width={Math.max(1, barW - 2)}
              height={posH}
              fill="hsl(var(--success))"
              opacity={0.75}
            />
          </g>
        );
      })}
      <line x1={thrX} x2={thrX} y1={12} y2={H - 12} stroke="hsl(var(--primary))" strokeDasharray="3 3" />
    </svg>
  );
}

function ConfusionMatrix({ c }: { c: { tp: number; fp: number; tn: number; fn: number } }) {
  const cells = [
    { label: "TP", value: c.tp, tone: "text-success" },
    { label: "FP", value: c.fp, tone: "text-destructive" },
    { label: "FN", value: c.fn, tone: "text-destructive" },
    { label: "TN", value: c.tn, tone: "text-muted-foreground" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-md border border-border bg-secondary/30 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{cell.label}</div>
          <div className={`mt-1 font-mono tabular text-lg font-semibold ${cell.tone}`}>{cell.value}</div>
        </div>
      ))}
    </div>
  );
}

function FeatureImportanceBars({ items }: { items: { feature: string; importance: number }[] }) {
  if (!items.length) return <div className="text-xs text-muted-foreground">Önem verisi yok.</div>;
  const max = Math.max(...items.map((i) => i.importance)) || 1;
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.feature} className="flex items-center gap-2">
          <div className="w-40 truncate text-xs text-muted-foreground" title={it.feature}>
            {it.feature}
          </div>
          <div className="h-2 flex-1 overflow-hidden rounded bg-secondary/50">
            <div
              className="h-full rounded bg-primary"
              style={{ width: `${(it.importance / max) * 100}%` }}
            />
          </div>
          <div className="w-14 text-right font-mono tabular text-xs text-foreground">
            {(it.importance * 100).toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}
