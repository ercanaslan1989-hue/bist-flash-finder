// ============================================================================
// ModelRegistry — append-only persistence of trained models + their metrics.
//
// Every training run is recorded: version, date, feature version, params,
// metrics and the data range used. Nothing is ever deleted (the tables grant no
// DELETE). Models are stored strictly as Challengers; the `status` column tracks
// challenger → candidate → champion, but changing it is a deliberate manual act.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { serializeModel } from "./model-store";
import type { Comparison } from "./champion-challenger";
import type { EvalReport, TrainedModel } from "./types";

const sb = supabase as unknown as { from: (table: string) => any };

export interface StoredModel {
  id: string;
  version: string;
  model_type: string;
  horizon: number;
  feature_version: string;
  feature_names: string[];
  params: unknown;
  data_start: string | null;
  data_end: string | null;
  train_samples: number | null;
  val_samples: number | null;
  test_samples: number | null;
  status: string;
  label_type: string;
  up_threshold: number;
  model_blob: unknown;
  notes: string | null;
  created_at: string;
}

export interface StoredModelMetric {
  id: string;
  model_id: string;
  dataset: string;
  horizon: number;
  threshold: number | null;
  signals: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  roc_auc: number | null;
  pr_auc: number | null;
  accuracy: number | null;
  avg_return: number | null;
  profit_factor: number | null;
  sharpe: number | null;
  max_drawdown: number | null;
  created_at: string;
}

const finite = (x: number | null | undefined): number | null =>
  x != null && Number.isFinite(x) ? x : null;

function metricRow(modelId: string, dataset: string, report: EvalReport) {
  const c = report.classification;
  const f = report.financial;
  return {
    model_id: modelId,
    dataset,
    horizon: report.horizon,
    threshold: finite(c.threshold),
    signals: f.signals,
    precision: finite(c.precision),
    recall: finite(c.recall),
    f1: finite(c.f1),
    roc_auc: finite(c.rocAuc),
    pr_auc: finite(c.prAuc),
    accuracy: finite(c.accuracy),
    avg_return: finite(f.avgReturn),
    profit_factor: finite(f.profitFactor),
    sharpe: finite(f.sharpe),
    max_drawdown: finite(f.maxDrawdown),
  };
}

export interface SaveModelInput {
  model: TrainedModel;
  validation?: EvalReport | null;
  test?: EvalReport | null;
  valSamples?: number;
  testSamples?: number;
  notes?: string;
}

/** Persist a trained model + its evaluation metrics. Returns the model id. */
export async function saveModel(input: SaveModelInput): Promise<string | null> {
  const { model } = input;
  const res = await sb
    .from("ml_models")
    .insert({
      version: model.version,
      model_type: model.type,
      horizon: model.horizon,
      feature_version: model.featureVersion,
      feature_names: model.featureNames,
      params: model.params,
      data_start: model.trainStart,
      data_end: model.trainEnd,
      train_samples: model.trainSamples,
      val_samples: input.valSamples ?? null,
      test_samples: input.testSamples ?? null,
      status: "challenger",
      label_type: model.labelType,
      up_threshold: model.upThreshold,
      model_blob: serializeModel(model),
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  const id: string | undefined = res.data?.id;
  if (!id) return null;

  const rows = [];
  if (input.validation) rows.push(metricRow(id, "validation", input.validation));
  if (input.test) rows.push(metricRow(id, "test", input.test));
  if (rows.length) await sb.from("ml_metrics").insert(rows);

  return id;
}

/** List recent models, newest first. */
export async function fetchModels(limit = 40): Promise<StoredModel[]> {
  const res = await sb
    .from("ml_models")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (res.data ?? []) as StoredModel[];
}

/** Metrics for a model. */
export async function fetchModelMetrics(modelId: string): Promise<StoredModelMetric[]> {
  const res = await sb.from("ml_metrics").select("*").eq("model_id", modelId);
  return (res.data ?? []) as StoredModelMetric[];
}

export interface StoredComparison {
  id: string;
  run_date: string;
  horizon: number;
  champion_id: string;
  champion_label: string | null;
  challenger_model_id: string | null;
  challenger_label: string | null;
  champion_precision: number | null;
  challenger_precision: number | null;
  champion_avg_return: number | null;
  challenger_avg_return: number | null;
  champion_signals: number | null;
  challenger_signals: number | null;
  winner: string | null;
  is_candidate: boolean;
  created_at: string;
}

/** Persist a Champion–Challenger comparison. Returns the row id. */
export async function saveComparison(
  challengerModelId: string | null,
  cmp: Comparison,
): Promise<string | null> {
  const res = await sb
    .from("ml_champion_challenger")
    .insert({
      horizon: cmp.horizon,
      champion_id: cmp.champion.id,
      champion_label: cmp.champion.label,
      challenger_model_id: challengerModelId,
      challenger_label: cmp.challenger.label,
      champion_precision: finite(cmp.champion.precision),
      challenger_precision: finite(cmp.challenger.precision),
      champion_avg_return: finite(cmp.champion.avgReturn),
      challenger_avg_return: finite(cmp.challenger.avgReturn),
      champion_signals: cmp.champion.signals,
      challenger_signals: cmp.challenger.signals,
      winner: cmp.winner,
      is_candidate: cmp.isCandidate,
    })
    .select("id")
    .single();
  return res.data?.id ?? null;
}

/** List recent Champion–Challenger comparisons, newest first. */
export async function fetchComparisons(limit = 40): Promise<StoredComparison[]> {
  const res = await sb
    .from("ml_champion_challenger")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (res.data ?? []) as StoredComparison[];
}
