// ============================================================================
// Serving glue — connects the persisted "active" ensemble (Champion + trained
// Challengers) to the live prediction flow WITHOUT changing it.
//
// The live recommendation path is still driven by the Rule Engine (Champion).
// This module is purely additive: given the same look-ahead-free ScoreContext
// the app already builds for each symbol, it produces an ensemble score that can
// be surfaced alongside the legacy score (dashboards, API responses) — never
// replacing it.
//
// The loader is split into a PURE builder (buildActiveServer) and thin IO
// wrappers, so it can be exercised from the browser flow, from a server route
// (Worker) and from tests with injected data — the maths stay identical.
// ============================================================================

import { extractFeatures } from "./feature-vector";
import { ModelServer, type ServingConfig, type ServedPrediction } from "./model-server";
import type { StoredEnsemble } from "./ensemble-registry";
import { fetchEnsembles } from "./ensemble-registry";
import { fetchModels, type StoredModel } from "./model-registry";
import type { EnsembleMethod } from "./ensemble";
import type { MlHorizon, Sample } from "./types";
import type { ScoreContext } from "@/lib/scoring";

/** A ready-to-serve active ensemble: its stored record plus the built server. */
export interface ActiveServer {
  ensemble: StoredEnsemble;
  server: ModelServer;
}

/** Loosely-typed shape of the JSON blob persisted in `ml_ensembles.config`. */
interface StoredEnsembleConfig {
  threshold?: number | null;
  championLabel?: string | null;
  logisticWeights?: number[] | null;
}

/** Reconstruct the ServingConfig from a persisted ensemble record. */
export function buildServingConfig(ensemble: StoredEnsemble): ServingConfig {
  const cfg = (ensemble.config ?? {}) as StoredEnsembleConfig;
  return {
    method: ensemble.method as EnsembleMethod,
    horizon: ensemble.horizon as MlHorizon,
    threshold: cfg.threshold != null && Number.isFinite(cfg.threshold) ? cfg.threshold : 0.5,
    championWeight: ensemble.champion_weight ?? 1,
    championLabel: cfg.championLabel ?? undefined,
    gateConfidence: ensemble.gate_confidence ?? undefined,
    logisticWeights: cfg.logisticWeights ?? undefined,
  };
}

/**
 * PURE builder: given a stored ensemble and the pool of stored models, build a
 * ModelServer. Returns null when the ensemble references no available models
 * (so callers can gracefully fall back to Champion-only). Models are looked up
 * by id and consumed exactly as trained — feature order is irrelevant.
 */
export function buildActiveServer(
  ensemble: StoredEnsemble,
  models: StoredModel[],
): ActiveServer | null {
  const byId = new Map(models.map((m) => [m.id, m]));
  const stored = ensemble.member_model_ids
    .map((id) => byId.get(id))
    .filter((m): m is StoredModel => !!m)
    .map((m) => ({
      id: m.id,
      label: `${m.model_type} · ${m.version}`,
      weight: 1,
      blob: m.model_blob,
    }));
  if (stored.length === 0) return null;
  const server = ModelServer.fromStored(buildServingConfig(ensemble), stored);
  return { ensemble, server };
}

/**
 * PURE selection: pick the active ensemble from a list (optionally pinned to a
 * horizon) and build its server. Newest wins when several are flagged active.
 */
export function selectActiveServer(
  ensembles: StoredEnsemble[],
  models: StoredModel[],
  horizon?: MlHorizon,
): ActiveServer | null {
  const active = ensembles.find(
    (e) => e.is_active && (horizon == null || e.horizon === horizon),
  );
  if (!active) return null;
  return buildActiveServer(active, models);
}

/**
 * IO wrapper for the browser/react-query flow: load the active ensemble + its
 * models via the (public-read) registry helpers. Returns null when nothing is
 * active or no member models exist.
 */
export async function loadActiveServer(horizon?: MlHorizon): Promise<ActiveServer | null> {
  const [ensembles, models] = await Promise.all([fetchEnsembles(50), fetchModels(200)]);
  return selectActiveServer(ensembles, models, horizon);
}

/**
 * Serve ensemble predictions for a batch of ScoreContexts. Features are derived
 * from each context (look-ahead-free by construction) and the Champion score is
 * taken from `legacyAiScore`. Order is preserved 1:1 with the input.
 */
export function servePredictions(
  server: ModelServer,
  contexts: ScoreContext[],
): ServedPrediction[] {
  const samples = contexts.map(
    (ctx) =>
      ({
        symbol: ctx.symbol,
        features: extractFeatures(ctx),
        championScore: ctx.legacyAiScore,
      }) as unknown as Sample,
  );
  return server.predictBatch(samples);
}

/** Serve a single ensemble prediction from a ScoreContext. */
export function servePrediction(server: ModelServer, ctx: ScoreContext): ServedPrediction {
  return servePredictions(server, [ctx])[0];
}
