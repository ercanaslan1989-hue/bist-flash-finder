// ResultStore — persists backtest runs, per-strategy metrics and a capped set
// of predictions, and reads back run history. History is append-only (the
// tables grant no delete), so past results are never lost.

import { supabase } from "@/integrations/supabase/client";
import { HORIZONS, type BacktestResult, type Prediction } from "./types";

const sb = supabase as unknown as { from: (table: string) => any };

/** Cap on stored predictions per run to keep browser inserts feasible. */
const MAX_STORED_PREDICTIONS = 1200;

export interface StoredRun {
  id: string;
  label: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  universe_size: number | null;
  min_score: number | null;
  horizons: number[] | null;
  total_predictions: number | null;
  created_at: string;
}

export interface StoredMetric {
  run_id: string;
  strategy_id: string;
  strategy_label: string | null;
  horizon: number;
  signals: number | null;
  hit_rate: number | null;
  avg_return: number | null;
  median_return: number | null;
  profit_factor: number | null;
  max_drawdown: number | null;
  sharpe: number | null;
  avg_holding: number | null;
  best_streak: number | null;
  worst_streak: number | null;
}

export interface StoredPrediction {
  run_id: string;
  strategy_id: string;
  symbol: string;
  signal_date: string;
  entry_close: number | null;
  score: number | null;
  ret_1d: number | null;
  ret_3d: number | null;
  ret_5d: number | null;
  ret_10d: number | null;
  ret_20d: number | null;
  max_ret: number | null;
  hit: boolean | null;
  days_to_hit: number | null;
}

function finiteOrNull(x: number | null | undefined): number | null {
  return x != null && Number.isFinite(x) ? x : null;
}

/** Persist a full backtest result. Returns the new run id, or null on failure. */
export async function saveBacktestResult(
  result: BacktestResult,
  label?: string,
): Promise<string | null> {
  const runRes = await sb
    .from("backtest_runs")
    .insert({
      label: label ?? null,
      status: "completed",
      start_date: result.startDate,
      end_date: result.endDate,
      universe_size: result.universeSize,
      min_score: result.params.minScore,
      horizons: [...HORIZONS],
      total_predictions: result.totalSignals,
      params: result.params,
    })
    .select("id")
    .single();

  const runId: string | undefined = runRes.data?.id;
  if (!runId) return null;

  // Metrics: one row per strategy per horizon.
  const metricRows: StoredMetric[] = [];
  for (const s of result.strategies) {
    for (const h of HORIZONS) {
      const m = s.metrics[h];
      metricRows.push({
        run_id: runId,
        strategy_id: s.strategyId,
        strategy_label: s.strategyLabel,
        horizon: h,
        signals: m.signals,
        hit_rate: finiteOrNull(m.hitRate),
        avg_return: finiteOrNull(m.avgReturn),
        median_return: finiteOrNull(m.medianReturn),
        profit_factor: finiteOrNull(m.profitFactor),
        max_drawdown: finiteOrNull(m.maxDrawdown),
        sharpe: finiteOrNull(m.sharpe),
        avg_holding: finiteOrNull(m.avgHolding),
        best_streak: m.bestStreak,
        worst_streak: m.worstStreak,
      });
    }
  }
  if (metricRows.length) await sb.from("backtest_metrics").insert(metricRows);

  // Predictions: keep the most recent across all strategies, capped.
  const all: Prediction[] = result.strategies.flatMap((s) => s.predictions);
  all.sort((a, b) => b.signalDate.localeCompare(a.signalDate));
  const capped = all.slice(0, MAX_STORED_PREDICTIONS);
  const predRows: StoredPrediction[] = capped.map((p) => ({
    run_id: runId,
    strategy_id: p.strategyId,
    symbol: p.symbol,
    signal_date: p.signalDate,
    entry_close: finiteOrNull(p.entryClose),
    score: finiteOrNull(p.score),
    ret_1d: finiteOrNull(p.ret1d),
    ret_3d: finiteOrNull(p.ret3d),
    ret_5d: finiteOrNull(p.ret5d),
    ret_10d: finiteOrNull(p.ret10d),
    ret_20d: finiteOrNull(p.ret20d),
    max_ret: finiteOrNull(p.maxRet),
    hit: p.hit,
    days_to_hit: p.daysToHit,
  }));
  // Insert in chunks to stay within request limits.
  for (let i = 0; i < predRows.length; i += 500) {
    await sb.from("backtest_predictions").insert(predRows.slice(i, i + 500));
  }

  return runId;
}

/** List recent runs, newest first. */
export async function fetchRuns(limit = 30): Promise<StoredRun[]> {
  const res = await sb
    .from("backtest_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (res.data ?? []) as StoredRun[];
}

/** Metrics for a run. */
export async function fetchRunMetrics(runId: string): Promise<StoredMetric[]> {
  const res = await sb.from("backtest_metrics").select("*").eq("run_id", runId);
  return (res.data ?? []) as StoredMetric[];
}

/** Most recent predictions for a run. */
export async function fetchRunPredictions(runId: string, limit = 100): Promise<StoredPrediction[]> {
  const res = await sb
    .from("backtest_predictions")
    .select("*")
    .eq("run_id", runId)
    .order("signal_date", { ascending: false })
    .limit(limit);
  return (res.data ?? []) as StoredPrediction[];
}
