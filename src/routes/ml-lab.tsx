import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Brain, Cpu, Gauge, Loader2, Play, Save, Square, Target, Trophy } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { fmtNum, fmtPct } from "@/lib/format";
import {
  buildDataset,
  fetchLatestSnapshotDate,
  timeSeriesSplit,
  trainModel,
  evaluateModel,
  compareToChampion,
  selectFeatures,
  defaultConfig,
  saveModel,
  saveComparison,
  fetchModels,
  fetchComparisons,
  featureLabel,
  DEFAULT_MODEL_TYPES,
  ML_HORIZONS,
  MlAbortError,
  type DatasetParams,
  type EvalReport,
  type MlHorizon,
  type ModelType,
  type Comparison,
  type CurvePoint,
  type MlProgress,
  type StoredModel,
  type StoredComparison,
} from "@/lib/ml";

export const Route = createFileRoute("/ml-lab")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ML Lab — Makine Öğrenmesi Eğitim Motoru | BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "Feature Store verisiyle XGBoost ve LightGBM Challenger modelleri eğiten, zaman serisine uygun değerlendiren ve canlı Kural Motoru (Champion) ile karşılaştıran bağımsız ML altyapısı. Look-ahead bias yoktur; canlı sistem etkilenmez.",
      },
      { property: "og:title", content: "ML Lab — BIST Sinyal Lab" },
      {
        property: "og:description",
        content: "Champion (Kural Motoru) vs Challenger (XGBoost/LightGBM) performans karşılaştırması.",
      },
    ],
  }),
  component: MlLabPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">ML Lab yüklenemedi</h2>
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

interface TrainedResult {
  type: ModelType;
  label: string;
  validation: EvalReport;
  test: EvalReport;
  comparison: Comparison;
}

function MlLabPage() {
  const latest = useQuery({
    queryKey: ["ml-latest-date"],
    queryFn: fetchLatestSnapshotDate,
    staleTime: 60 * 60_000,
  });
  const models = useQuery({ queryKey: ["ml-models"], queryFn: () => fetchModels(20), staleTime: 60_000 });
  const comps = useQuery({ queryKey: ["ml-comps"], queryFn: () => fetchComparisons(20), staleTime: 60_000 });

  const [params, setParams] = useState<DatasetParams>({
    startDate: "",
    endDate: "",
    warmup: 50,
    upThreshold: 0,
  });
  const [horizon, setHorizon] = useState<MlHorizon>(5);
  const [datesInit, setDatesInit] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState<MlProgress | null>(null);
  const [results, setResults] = useState<TrainedResult[] | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [active, setActive] = useState<ModelType>("xgboost");
  const abortRef = useRef<AbortController | null>(null);
  const savedModelsRef = useRef<import("@/lib/ml").TrainedModel[]>([]);

  if (latest.data && !datesInit) {
    setParams((p) => ({ ...p, endDate: latest.data!, startDate: isoMinusDays(latest.data!, 400) }));
    setDatesInit(true);
  }

  async function handleTrain() {
    setError(null);
    setResults(null);
    setSaveState("idle");
    setRunning(true);
    savedModelsRef.current = [];
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setPhase("Feature Store verisi hazırlanıyor…");
      setProgress(null);
      const samples = await buildDataset(params, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (controller.signal.aborted) throw new MlAbortError();
      if (samples.length < 200) throw new Error("Yeterli örnek yok. Tarih aralığını genişletin.");

      const split = timeSeriesSplit(samples, 0.6, 0.2);
      const selected = selectFeatures(split.train);
      setFeatures(selected);

      const out: TrainedResult[] = [];
      for (const type of DEFAULT_MODEL_TYPES) {
        setPhase(`${type.toUpperCase()} eğitiliyor…`);
        await new Promise((r) => setTimeout(r, 0));
        const model = trainModel(split.train, {
          config: defaultConfig(type),
          horizon,
          upThreshold: params.upThreshold,
          featureNames: selected,
        });
        const validation = evaluateModel(model, split.validation, horizon, 0.5);
        const test = evaluateModel(model, split.test, horizon, 0.5);
        const comparison = compareToChampion(model, split.test, horizon, 60, 0.5);
        out.push({ type, label: model.label, validation, test, comparison });
        savedModelsRef.current.push(model);
      }
      setResults(out);
      setActive(out[0].type);
    } catch (e) {
      if (e instanceof MlAbortError) setError("Eğitim durduruldu.");
      else setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setRunning(false);
      setPhase("");
      abortRef.current = null;
    }
  }

  async function handleSave() {
    if (!results) return;
    setSaveState("saving");
    try {
      for (let i = 0; i < savedModelsRef.current.length; i++) {
        const model = savedModelsRef.current[i];
        const res = results[i];
        const id = await saveModel({
          model,
          validation: res.validation,
          test: res.test,
          valSamples: res.validation.n,
          testSamples: res.test.n,
        });
        await saveComparison(id, res.comparison);
      }
      setSaveState("saved");
      models.refetch();
      comps.refetch();
    } catch {
      setSaveState("idle");
      setError("Modeller kaydedilemedi.");
    }
  }

  const activeResult = useMemo(
    () => results?.find((r) => r.type === active) ?? results?.[0] ?? null,
    [results, active],
  );
  const best = useMemo(() => {
    if (!results) return null;
    return [...results].sort((a, b) => b.test.classification.rocAuc - a.test.classification.rocAuc)[0];
  }, [results]);

  return (
    <AppShell>
      <section>
        <div className="flex items-center gap-2 text-primary">
          <Brain className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">ML Lab</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-foreground sm:text-3xl">
          Makine Öğrenmesi Eğitim Motoru
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Feature Store verisiyle XGBoost ve LightGBM <strong>Challenger</strong> modelleri eğitilir.
          Bölme zaman serisine uygundur (geçmişle eğit, gelecekte test et); look-ahead bias engellenir.
          Canlı öneriler <strong>Kural Motoru (Champion)</strong> ile üretilmeye devam eder — hiçbir
          model otomatik olarak canlıya alınmaz.
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!running ? (
            <Button onClick={handleTrain} disabled={!params.startDate || !params.endDate}>
              <Play className="h-4 w-4" /> Modelleri Eğit
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => abortRef.current?.abort()}>
              <Square className="h-4 w-4" /> Durdur
            </Button>
          )}
          {results && !running ? (
            <Button variant="secondary" onClick={handleSave} disabled={saveState === "saving"}>
              {saveState === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveState === "saved" ? "Kaydedildi" : "Modelleri Kaydet"}
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

      {results && best ? (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="En İyi ROC-AUC"
              value={best.test.classification.rocAuc.toFixed(3)}
              sub={best.label}
              icon={<Gauge className="h-4 w-4" />}
              accent="primary"
            />
            <StatCard
              label="En İyi F1"
              value={best.test.classification.f1.toFixed(3)}
              sub={`${horizon} gün ufku`}
              icon={<Target className="h-4 w-4" />}
              accent="success"
            />
            <StatCard
              label="Champion vs Challenger"
              value={
                best.comparison.winner === "challenger"
                  ? "Challenger"
                  : best.comparison.winner === "champion"
                    ? "Champion"
                    : "Berabere"
              }
              sub={best.comparison.isCandidate ? "Aday gösterildi" : "Otomatik geçiş yok"}
              icon={<Trophy className="h-4 w-4" />}
              accent="accent"
            />
            <StatCard
              label="Test Örnekleri"
              value={fmtNum(best.test.n)}
              sub={`${features.length} özellik`}
              icon={<Cpu className="h-4 w-4" />}
            />
          </section>

          <ModelComparison results={results} />

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Model detayı:</span>
            {results.map((r) => (
              <button
                key={r.type}
                type="button"
                onClick={() => setActive(r.type)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  r.type === active
                    ? "bg-secondary text-foreground"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {activeResult ? (
            <>
              <ChampionChallengerCard comparison={activeResult.comparison} />
              <section className="mt-6 grid gap-6 lg:grid-cols-2">
                <CurveCard title="ROC Eğrisi" points={activeResult.test.rocCurve} diagonal />
                <CurveCard title="Precision-Recall Eğrisi" points={activeResult.test.prCurve} />
              </section>
              <section className="mt-6 grid gap-6 lg:grid-cols-2">
                <ConfusionMatrix report={activeResult.test} />
                <FeatureImportance report={activeResult.test} />
              </section>
            </>
          ) : null}
        </>
      ) : null}

      <ModelHistory models={models.data ?? []} loading={models.isLoading} />
      <ComparisonHistory rows={comps.data ?? []} loading={comps.isLoading} />

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Yalnızca araştırma amaçlıdır — yatırım tavsiyesi değildir. Modeller Challenger olarak eğitilir;
        canlı sisteme otomatik alınmaz.
      </p>
    </AppShell>
  );
}

// ===== Model comparison table =====
function ModelComparison({ results }: { results: TrainedResult[] }) {
  const m = (r: TrainedResult) => r.test.classification;
  const f = (r: TrainedResult) => r.test.financial;
  return (
    <section className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Model</th>
            <th className="px-4 py-3 text-right">Precision</th>
            <th className="px-4 py-3 text-right">Recall</th>
            <th className="px-4 py-3 text-right">F1</th>
            <th className="px-4 py-3 text-right">ROC-AUC</th>
            <th className="px-4 py-3 text-right">PR-AUC</th>
            <th className="px-4 py-3 text-right">Doğruluk</th>
            <th className="px-4 py-3 text-right">Ort. Getiri</th>
            <th className="px-4 py-3 text-right">Sinyal</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.type} className="border-b border-border/60">
              <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
              <td className="px-4 py-3 text-right font-mono tabular">{m(r).precision.toFixed(3)}</td>
              <td className="px-4 py-3 text-right font-mono tabular">{m(r).recall.toFixed(3)}</td>
              <td className="px-4 py-3 text-right font-mono tabular">{m(r).f1.toFixed(3)}</td>
              <td className="px-4 py-3 text-right font-mono tabular text-foreground">
                {m(r).rocAuc.toFixed(3)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular">{m(r).prAuc.toFixed(3)}</td>
              <td className="px-4 py-3 text-right font-mono tabular">{m(r).accuracy.toFixed(3)}</td>
              <td
                className={`px-4 py-3 text-right font-mono tabular ${
                  (f(r).avgReturn ?? 0) >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {fmtPct(f(r).avgReturn, 2)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular">{fmtNum(f(r).signals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ===== Champion vs Challenger card =====
function ChampionChallengerCard({ comparison }: { comparison: Comparison }) {
  const c = comparison;
  const cell = (v: number | null, pct = false, digits = 3) =>
    v == null ? "—" : pct ? fmtPct(v, 2) : v.toFixed(digits);
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-display text-sm font-semibold text-foreground">Champion vs Challenger</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          { title: c.champion.label, s: c.champion, win: c.winner === "champion" },
          { title: c.challenger.label, s: c.challenger, win: c.winner === "challenger" },
        ].map((side) => (
          <div
            key={side.title}
            className={`rounded-lg border p-3 ${side.win ? "border-success/40 bg-success/5" : "border-border"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{side.title}</span>
              {side.win ? <Trophy className="h-4 w-4 text-accent" /> : null}
            </div>
            <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <dt>Precision</dt>
                <dd className="font-mono tabular text-foreground">{cell(side.s.precision)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Ort. Getiri</dt>
                <dd className="font-mono tabular text-foreground">{cell(side.s.avgReturn, true)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>İsabet</dt>
                <dd className="font-mono tabular text-foreground">{cell(side.s.hitRate, false, 1)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Sinyal</dt>
                <dd className="font-mono tabular text-foreground">{fmtNum(side.s.signals)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {c.isCandidate
          ? "Challenger, Champion'ı hem isabet hem getiride yeterli sinyalle geçti → Champion adayı olarak işaretlendi. Geçiş manuel karardır."
          : "Challenger henüz Champion adaylığı için yeterli üstünlük göstermedi. Canlı sistem değişmez."}
      </p>
    </section>
  );
}

// ===== Curve chart (SVG) =====
function CurveCard({ title, points, diagonal }: { title: string; points: CurvePoint[]; diagonal?: boolean }) {
  const W = 320;
  const H = 220;
  const pad = 28;
  const sx = (x: number) => pad + x * (W - 2 * pad);
  const sy = (y: number) => H - pad - y * (H - 2 * pad);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={title}>
        <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} className="fill-none stroke-border" strokeWidth={1} />
        {diagonal ? (
          <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} className="stroke-muted-foreground/40" strokeDasharray="4 4" />
        ) : null}
        <path d={path} className="fill-none stroke-primary" strokeWidth={2} />
      </svg>
    </div>
  );
}

// ===== Confusion matrix =====
function ConfusionMatrix({ report }: { report: EvalReport }) {
  const c = report.classification;
  const cellCls = "rounded-lg p-4 text-center";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-sm font-semibold text-foreground">
        Confusion Matrix (eşik {c.threshold})
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className={`${cellCls} bg-success/10`}>
          <div className="text-lg font-bold text-foreground">{fmtNum(c.tp)}</div>
          <div className="text-xs text-muted-foreground">Doğru Pozitif</div>
        </div>
        <div className={`${cellCls} bg-destructive/10`}>
          <div className="text-lg font-bold text-foreground">{fmtNum(c.fp)}</div>
          <div className="text-xs text-muted-foreground">Yanlış Pozitif</div>
        </div>
        <div className={`${cellCls} bg-destructive/10`}>
          <div className="text-lg font-bold text-foreground">{fmtNum(c.fn)}</div>
          <div className="text-xs text-muted-foreground">Yanlış Negatif</div>
        </div>
        <div className={`${cellCls} bg-success/10`}>
          <div className="text-lg font-bold text-foreground">{fmtNum(c.tn)}</div>
          <div className="text-xs text-muted-foreground">Doğru Negatif</div>
        </div>
      </div>
    </div>
  );
}

// ===== Feature importance =====
function FeatureImportance({ report }: { report: EvalReport }) {
  const items = report.featureImportance.slice(0, 10);
  const max = Math.max(...items.map((i) => i.importance), 1e-9);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-sm font-semibold text-foreground">Özellik Önemi</h3>
      <div className="mt-3 space-y-2">
        {items.map((it) => (
          <div key={it.feature} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
              {featureLabel(it.feature)}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(it.importance / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Training history =====
function ModelHistory({ models, loading }: { models: StoredModel[]; loading: boolean }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-foreground">Eğitim Geçmişi (Model Registry)</h2>
      {loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Yükleniyor…</p>
      ) : models.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Henüz kaydedilmiş model yok.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Sürüm</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3 text-right">Ufuk</th>
                <th className="px-4 py-3">Özellik Sür.</th>
                <th className="px-4 py-3 text-right">Örnek</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{m.version}</td>
                  <td className="px-4 py-3">{m.model_type}</td>
                  <td className="px-4 py-3 text-right font-mono tabular">{m.horizon}g</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.feature_version}</td>
                  <td className="px-4 py-3 text-right font-mono tabular">{fmtNum(m.train_samples ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{m.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("tr-TR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ===== Champion-Challenger history =====
function ComparisonHistory({ rows, loading }: { rows: StoredComparison[]; loading: boolean }) {
  if (loading || rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-foreground">
        Champion vs Challenger Geçmişi
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Challenger</th>
              <th className="px-4 py-3 text-right">Ufuk</th>
              <th className="px-4 py-3 text-right">Ch. Precision</th>
              <th className="px-4 py-3 text-right">Cl. Precision</th>
              <th className="px-4 py-3">Kazanan</th>
              <th className="px-4 py-3">Aday?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="px-4 py-3 text-xs text-foreground">{r.challenger_label ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono tabular">{r.horizon}g</td>
                <td className="px-4 py-3 text-right font-mono tabular">
                  {r.champion_precision != null ? r.champion_precision.toFixed(3) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular">
                  {r.challenger_precision != null ? r.challenger_precision.toFixed(3) : "—"}
                </td>
                <td className="px-4 py-3 text-xs">{r.winner ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{r.is_candidate ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
