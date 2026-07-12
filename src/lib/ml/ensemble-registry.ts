// ============================================================================
// EnsembleRegistry — persistence of ensemble (Champion + Challenger) configs.
//
// Ensembles are saved as configurations plus their measured serving quality on
// a test split. Marking one "active" is a deliberate manual act (like promoting
// a Champion); nothing here changes the live recommendation path automatically.
//
// Uses the same public-read / public-write model as the other ml_* tables via a
// loose Supabase cast, so it does not depend on generated types.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import type { BlendMetrics } from "./ensemble";
import type { ServingConfig } from "./model-server";

const sb = supabase as unknown as { from: (table: string) => any };

export interface StoredEnsemble {
  id: string;
  name: string;
  method: string;
  horizon: number;
  champion_weight: number | null;
  gate_confidence: number | null;
  config: unknown;
  member_model_ids: string[];
  is_active: boolean;
  precision: number | null;
  avg_return: number | null;
  hit_rate: number | null;
  signals: number | null;
  test_samples: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const finite = (x: number | null | undefined): number | null =>
  x != null && Number.isFinite(x) ? x : null;

export interface SaveEnsembleInput {
  name: string;
  config: ServingConfig;
  memberModelIds: string[];
  metrics?: BlendMetrics | null;
  testSamples?: number;
  notes?: string;
}

/** Persist an ensemble configuration + its measured quality. Returns the id. */
export async function saveEnsemble(input: SaveEnsembleInput): Promise<string | null> {
  const { config, metrics } = input;
  const res = await sb
    .from("ml_ensembles")
    .insert({
      name: input.name,
      method: config.method,
      horizon: config.horizon,
      champion_weight: finite(config.championWeight),
      gate_confidence: finite(config.gateConfidence ?? null),
      config: {
        threshold: config.threshold,
        championLabel: config.championLabel ?? null,
        logisticWeights: config.logisticWeights ?? null,
      },
      member_model_ids: input.memberModelIds,
      is_active: false,
      precision: finite(metrics?.precision ?? null),
      avg_return: finite(metrics?.avgReturn ?? null),
      hit_rate: finite(metrics?.hitRate ?? null),
      signals: metrics?.signals ?? null,
      test_samples: input.testSamples ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  return res.data?.id ?? null;
}

/** List saved ensembles, newest first. */
export async function fetchEnsembles(limit = 40): Promise<StoredEnsemble[]> {
  const res = await sb
    .from("ml_ensembles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (res.data ?? []) as StoredEnsemble[];
}

/**
 * Mark one ensemble active for its horizon and deactivate the others at that
 * horizon. This is a manual, reversible bookkeeping flag — it does not route
 * live traffic; the Rule Engine remains the live Champion.
 */
export async function setActiveEnsemble(id: string, horizon: number): Promise<void> {
  await sb.from("ml_ensembles").update({ is_active: false }).eq("horizon", horizon);
  await sb.from("ml_ensembles").update({ is_active: true }).eq("id", id);
}
