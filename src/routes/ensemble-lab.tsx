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
        </div>

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
