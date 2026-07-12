// ============================================================================
// ModelServer — the serving layer for FAZ 5 (Ensemble & Model Serving).
//
// It bridges the deterministic ensemble maths (ensemble.ts) with real trained
// Challenger models and the live Rule-Engine (Champion) score. Given feature
// vectors + a Champion score, it produces a single blended decision score and a
// per-member breakdown for transparency.
//
// Serving is READ-ONLY and controlled: the Champion is always a member with its
// own weight, models are consumed exactly as trained (feature lookup by name,
// so feature order is irrelevant), and nothing here promotes a model or mutates
// the live system.
// ============================================================================

import { deserializeModel } from "./model-store";
import { predictBatch } from "./predictor";
import {
  blendScores,
  evaluateBlend,
  fitLogisticStacker,
  type BlendMetrics,
  type EnsembleConfig,
  type EnsembleMember,
  type EnsembleMethod,
} from "./ensemble";
import type { FeatureVector, MlHorizon, Sample, TrainedModel } from "./types";

/** Normalise a 0-100 Rule-Engine score into a [0,1] probability. Null → 0.5. */
export function normalizeChampionScore(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return 0.5;
  const p = score / 100;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** A challenger participating in serving, with its weight and trained model. */
export interface ServingChallenger {
  id: string;
  label: string;
  weight: number;
  model: TrainedModel;
}

export interface ServingConfig {
  method: EnsembleMethod;
  horizon: MlHorizon;
  /** Decision threshold applied to the blended score (0-1). */
  threshold: number;
  /** Champion (Rule Engine) weight in the blend. */
  championWeight: number;
  championLabel?: string;
  /** For "gated". */
  gateConfidence?: number;
  /** For "logistic": [bias, championW, challenger0W, …]. */
  logisticWeights?: number[];
}

export interface ServedMemberScore {
  id: string;
  label: string;
  role: "champion" | "challenger";
  score: number;
}

export interface ServedPrediction {
  /** Blended probability in [0,1]. */
  score: number;
  /** score >= config.threshold. */
  decision: boolean;
  members: ServedMemberScore[];
}

const CHAMPION_ID = "rule_engine";

export class ModelServer {
  constructor(
    public readonly config: ServingConfig,
    public readonly challengers: ServingChallenger[],
  ) {}

  /** Build a server from stored model blobs (as persisted by the registry). */
  static fromStored(
    config: ServingConfig,
    stored: { id: string; label: string; weight: number; blob: unknown }[],
  ): ModelServer {
    return new ModelServer(
      config,
      stored.map((s) => ({
        id: s.id,
        label: s.label,
        weight: s.weight,
        model: deserializeModel(s.blob as never),
      })),
    );
  }

  private ensembleConfig(): EnsembleConfig {
    return {
      method: this.config.method,
      gateConfidence: this.config.gateConfidence,
      logisticWeights: this.config.logisticWeights,
    };
  }

  /** Champion + challenger members with per-sample scores (Champion first). */
  private members(samples: Sample[], championScores: (number | null)[]): EnsembleMember[] {
    const champion: EnsembleMember = {
      id: CHAMPION_ID,
      label: this.config.championLabel ?? "Kural Motoru (Şampiyon)",
      role: "champion",
      weight: this.config.championWeight,
      scores: championScores.map(normalizeChampionScore),
    };
    const challengers: EnsembleMember[] = this.challengers.map((c) => ({
      id: c.id,
      label: c.label,
      role: "challenger",
      weight: c.weight,
      scores: predictBatch(c.model, samples),
    }));
    return [champion, ...challengers];
  }

  /** Serve blended predictions for a batch of samples (uses s.championScore). */
  predictBatch(samples: Sample[]): ServedPrediction[] {
    const championScores = samples.map((s) => s.championScore);
    const members = this.members(samples, championScores);
    const blended = blendScores(members, this.ensembleConfig());
    return blended.map((score, i) => ({
      score,
      decision: score >= this.config.threshold,
      members: members.map((m) => ({ id: m.id, label: m.label, role: m.role, score: m.scores[i] })),
    }));
  }

  /** Serve a single blended prediction from a raw feature vector. */
  predict(features: FeatureVector, championScore: number | null): ServedPrediction {
    const sample = { features, championScore } as unknown as Sample;
    return this.predictBatch([sample])[0];
  }

  /** Blended-decision quality on a settled test split at this server's horizon. */
  evaluate(test: Sample[]): BlendMetrics {
    const h = this.config.horizon;
    const preds = this.predictBatch(test);
    const scores = preds.map((p) => p.score);
    const labels = test.map((s) => s.labels[h].up);
    const returns = test.map((s) => s.labels[h].forwardReturn);
    return evaluateBlend(scores, labels, returns, this.config.threshold);
  }
}

/**
 * Fit a logistic stacker for a Champion + challengers setup on a TRAIN split.
 * Returns weights aligned to [bias, champion, ...challengers] — feed straight
 * into `ServingConfig.logisticWeights`. Only training rows are used.
 */
export function fitServingStacker(
  train: Sample[],
  challengers: ServingChallenger[],
  horizon: MlHorizon,
  opts?: { iterations?: number; learningRate?: number; l2?: number },
): number[] {
  const settled = train.filter((s) => s.labels[horizon].up != null);
  const champCol = settled.map((s) => normalizeChampionScore(s.championScore));
  const chalCols = challengers.map((c) => predictBatch(c.model, settled));
  const rows = settled.map((_, i) => [champCol[i], ...chalCols.map((col) => col[i])]);
  const labels = settled.map((s) => (s.labels[horizon].up === 1 ? 1 : 0));
  return fitLogisticStacker(rows, labels, opts);
}
