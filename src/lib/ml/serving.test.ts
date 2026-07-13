// ============================================================================
// Serving tests (FAZ 5) — connecting the active ensemble to the prediction flow.
//
// Verifies: config reconstruction from a stored record, building a server from
// stored models, active selection (with horizon pinning), graceful null when no
// models/ensemble are available, that the Champion is always a served member,
// determinism/reproducibility, and feature-order independence at serve time.
// ============================================================================

import { describe, expect, it } from "vitest";

import {
  buildServingConfig,
  buildActiveServer,
  selectActiveServer,
  servePredictions,
  servePrediction,
} from "./serving";
import { extractFeatures } from "./feature-vector";
import { serializeModel } from "./model-store";
import { trainModel, timeSeriesSplit } from "./trainer";
import { defaultConfig } from "./models";
import { selectFeatures } from "./feature-selector";
import { mulberry32 } from "./gbdt";
import type { StoredEnsemble } from "./ensemble-registry";
import type { StoredModel } from "./model-registry";
import type { MlHorizon, Sample, TrainedModel } from "./types";
import { ML_HORIZONS } from "./types";
import { makeContext } from "@/lib/scoring/fixtures";
import type { ScoreContext } from "@/lib/scoring";

const HORIZON: MlHorizon = 5;

/** Deterministic dataset whose features come from real ScoreContexts, so the
 *  trained model is consumable by the serving layer via extractFeatures. */
function buildCtxDataset(n = 400, seed = 11): { samples: Sample[]; contexts: ScoreContext[] } {
  const rand = mulberry32(seed);
  const samples: Sample[] = [];
  const contexts: ScoreContext[] = [];
  const start = new Date("2023-01-01");
  for (let i = 0; i < n; i++) {
    const rsi = rand() * 100;
    const ret5d = rand() * 20 - 10;
    const legacyAiScore = Math.round(30 + rand() * 50);
    const ctx = makeContext({ symbol: `S${i % 25}`, rsi, ret5d, legacyAiScore });
    const features = extractFeatures(ctx);
    const logit = (rsi - 50) / 15 + ret5d / 8 + (rand() - 0.5);
    const up = (logit > 0 ? 1 : 0) as 0 | 1;
    const ret = logit * 3;
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const labels = {} as Sample["labels"];
    for (const h of ML_HORIZONS) labels[h] = { up, forwardReturn: ret, riskAdjusted: ret };
    samples.push({ symbol: ctx.symbol, date: d.toISOString().slice(0, 10), features, labels, championScore: legacyAiScore });
    contexts.push(ctx);
  }
  return { samples, contexts };
}

function trainChallenger(samples: Sample[]): TrainedModel {
  const { train } = timeSeriesSplit(samples, 0.4);
  const featureNames = selectFeatures(train);
  return trainModel(train, { config: defaultConfig("xgboost"), horizon: HORIZON, upThreshold: 0, featureNames });
}

function storedModel(model: TrainedModel, id = "model-1"): StoredModel {
  return {
    id,
    version: model.version,
    model_type: model.type,
    horizon: model.horizon,
    feature_version: model.featureVersion,
    feature_names: model.featureNames,
    params: model.params,
    data_start: model.trainStart,
    data_end: model.trainEnd,
    train_samples: model.trainSamples,
    val_samples: null,
    test_samples: null,
    status: "challenger",
    label_type: model.labelType,
    up_threshold: model.upThreshold,
    model_blob: serializeModel(model),
    notes: null,
    created_at: "2024-01-01T00:00:00Z",
  };
}

function storedEnsemble(
  memberIds: string[],
  overrides: Partial<StoredEnsemble> = {},
): StoredEnsemble {
  return {
    id: "ens-1",
    name: "Test Ensemble",
    method: "weighted",
    horizon: HORIZON,
    champion_weight: 1,
    gate_confidence: null,
    config: { threshold: 0.5, championLabel: null, logisticWeights: null },
    member_model_ids: memberIds,
    is_active: true,
    precision: null,
    avg_return: null,
    hit_rate: null,
    signals: null,
    test_samples: null,
    notes: null,
    created_at: "2024-01-02T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("buildServingConfig", () => {
  it("reconstructs the config from a stored record with defaults", () => {
    const cfg = buildServingConfig(storedEnsemble(["model-1"], { config: {} }));
    expect(cfg.method).toBe("weighted");
    expect(cfg.horizon).toBe(HORIZON);
    expect(cfg.threshold).toBe(0.5); // default when absent
    expect(cfg.championWeight).toBe(1);
  });

  it("honours a persisted threshold and logistic weights", () => {
    const cfg = buildServingConfig(
      storedEnsemble(["m"], {
        method: "logistic",
        config: { threshold: 0.62, championLabel: "Kural", logisticWeights: [0.1, 0.2, 0.3] },
      }),
    );
    expect(cfg.threshold).toBeCloseTo(0.62, 10);
    expect(cfg.championLabel).toBe("Kural");
    expect(cfg.logisticWeights).toEqual([0.1, 0.2, 0.3]);
  });
});

describe("buildActiveServer / selectActiveServer", () => {
  const { samples } = buildCtxDataset();
  const model = trainChallenger(samples);
  const models = [storedModel(model, "model-1")];

  it("returns null when the ensemble references no available models", () => {
    expect(buildActiveServer(storedEnsemble(["missing"]), models)).toBeNull();
    expect(buildActiveServer(storedEnsemble([]), models)).toBeNull();
  });

  it("builds a server that includes the referenced challenger", () => {
    const active = buildActiveServer(storedEnsemble(["model-1"]), models);
    expect(active).not.toBeNull();
    expect(active!.server.challengers).toHaveLength(1);
  });

  it("selects the active ensemble and can pin to a horizon", () => {
    const ensembles = [
      storedEnsemble(["model-1"], { id: "a", horizon: 3, is_active: false }),
      storedEnsemble(["model-1"], { id: "b", horizon: HORIZON, is_active: true }),
    ];
    expect(selectActiveServer(ensembles, models)?.ensemble.id).toBe("b");
    expect(selectActiveServer(ensembles, models, HORIZON)?.ensemble.id).toBe("b");
    expect(selectActiveServer(ensembles, models, 3)).toBeNull(); // horizon-3 not active
  });

  it("returns null when nothing is active (Champion-only fallback)", () => {
    const ensembles = [storedEnsemble(["model-1"], { is_active: false })];
    expect(selectActiveServer(ensembles, models)).toBeNull();
  });
});

describe("servePredictions", () => {
  const { samples, contexts } = buildCtxDataset();
  const model = trainChallenger(samples);
  const active = buildActiveServer(storedEnsemble(["model-1"]), [storedModel(model, "model-1")])!;

  it("always includes the Champion as a served member", () => {
    const preds = servePredictions(active.server, contexts.slice(0, 5));
    for (const p of preds) {
      const roles = p.members.map((m) => m.role);
      expect(roles).toContain("champion");
      expect(roles).toContain("challenger");
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic — same contexts yield identical scores", () => {
    const a = servePredictions(active.server, contexts);
    const b = servePredictions(active.server, contexts);
    expect(a.map((p) => p.score)).toEqual(b.map((p) => p.score));
    expect(a.map((p) => p.decision)).toEqual(b.map((p) => p.decision));
  });

  it("is feature-order independent (lookup by name, not position)", () => {
    const ctx = contexts[0];
    const straight = servePrediction(active.server, ctx);
    // Serve directly from a shuffled-key sample and compare to the challenger's
    // served score — reordering feature keys must not change the output.
    const feats = extractFeatures(ctx);
    const reversed: Record<string, number | null> = {};
    for (const k of Object.keys(feats).reverse()) reversed[k] = feats[k];
    const viaBatch = active.server.predictBatch([
      { features: reversed, championScore: ctx.legacyAiScore } as unknown as Sample,
    ])[0];
    expect(viaBatch.score).toBeCloseTo(straight.score, 12);
  });
});
