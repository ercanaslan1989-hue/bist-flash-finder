// ReportGenerator — turns a BacktestResult into a ranked, human-readable
// comparison so the "which strategy wins?" question is answered automatically.

import type { BacktestResult, Horizon, PerformanceMetrics } from "./types";

export interface StrategyRanking {
  strategyId: string;
  strategyLabel: string;
  metrics: PerformanceMetrics;
  /** Composite 0-100-ish quality score used for ranking. */
  quality: number;
  rank: number;
}

export interface BacktestReport {
  primaryHorizon: Horizon;
  ranked: StrategyRanking[];
  best: StrategyRanking | null;
  worst: StrategyRanking | null;
  summary: string;
}

/**
 * Composite quality: rewards hit rate, average return and profit factor while
 * penalising deep drawdowns. Deterministic and bounded so ranking is stable.
 */
export function qualityScore(m: PerformanceMetrics): number {
  if (!m.signals) return 0;
  const hit = m.hitRate ?? 0; // 0-100
  const avg = (m.avgReturn ?? 0) * 4; // ~ -/+ tens
  const pf = Math.min(m.profitFactor ?? 0, 5) * 6; // 0-30
  const dd = (m.maxDrawdown ?? 0) * 0.3; // <= 0 → penalty
  return Math.round((hit * 0.5 + avg + pf + dd) * 10) / 10;
}

const pct = (x: number | null) => (x == null ? "—" : `%${x.toFixed(1)}`);

export function generateReport(result: BacktestResult): BacktestReport {
  const h = result.primaryHorizon;
  const ranked: StrategyRanking[] = result.strategies
    .map((s) => {
      const metrics = s.metrics[h];
      return {
        strategyId: s.strategyId,
        strategyLabel: s.strategyLabel,
        metrics,
        quality: qualityScore(metrics),
        rank: 0,
      };
    })
    .sort((a, b) => b.quality - a.quality)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const best = ranked[0] ?? null;
  const worst = ranked.length ? ranked[ranked.length - 1] : null;

  let summary = "Yeterli sinyal üretilmedi.";
  if (best && best.metrics.signals > 0) {
    summary =
      `${h} işlem günü ufkunda en başarılı strateji "${best.strategyLabel}" ` +
      `(isabet ${pct(best.metrics.hitRate)}, ort. getiri ${pct(best.metrics.avgReturn)}, ` +
      `${best.metrics.signals} sinyal).`;
    if (worst && worst.strategyId !== best.strategyId) {
      summary += ` En zayıfı "${worst.strategyLabel}" (isabet ${pct(worst.metrics.hitRate)}).`;
    }
  }

  return { primaryHorizon: h, ranked, best, worst, summary };
}
