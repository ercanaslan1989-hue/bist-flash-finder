import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

const sb = supabase as unknown as { from: (table: string) => any };

const PAGE = 1000;

// ===== Target definitions =====
// Each daily recommendation carries a `best_target`. These are the horizon
// (trading days) + threshold (%) each target is judged against. `lu` is a
// single-session limit-up (~+%10), the rest are cumulative gains vs the entry
// close within the horizon window.
export interface TargetDef {
  horizon: number;
  threshold: number;
  daily?: boolean;
  label: string;
}

export const TARGET_DEFS: Record<string, TargetDef> = {
  lu: { horizon: 5, threshold: 10, daily: true, label: "Tavan (+%10)" },
  g10: { horizon: 5, threshold: 10, label: "5g +%10 (birikimli)" },
  g15: { horizon: 10, threshold: 15, label: "10g +%15 (birikimli)" },
  g20: { horizon: 20, threshold: 20, label: "20g +%20 (birikimli)" },
};

export type OutcomeStatus = "hit" | "miss" | "pending";

export type MissReason =
  | "market"
  | "decline"
  | "faded"
  | "close"
  | "flat";

export const MISS_REASON_LABELS: Record<MissReason, string> = {
  market: "Piyasa geneli zayıftı",
  decline: "Sert geri çekildi",
  faded: "Momentum söndü",
  close: "Hedefe yaklaştı ama yetmedi",
  flat: "Yatay seyretti",
};

export const MISS_REASON_DESC: Record<MissReason, string> = {
  market:
    "Sinyal doğduktan sonraki pencerede piyasa geneli belirgin şekilde düştü; hisse akıntıya karşı yükselemedi.",
  decline:
    "Hisse hedefe yönelmek yerine sert şekilde geri çekildi (kapanış girişin belirgin altında).",
  faded:
    "Hisse başlangıçta yükseldi fakat momentum söndü; kazanç kalıcı olmadı ve hedefin altında kaldı.",
  close:
    "Hisse hedefin çok yakınına geldi (eşiğin ≥%70'i) ancak pencere içinde eşiği aşamadı.",
  flat: "Hisse pencere boyunca yatay seyretti; belirgin bir yön oluşmadı.",
};

export interface PredictionOutcome {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  score_date: string;
  target: string;
  targetLabel: string;
  horizon: number;
  threshold: number;
  probability: number | null;
  histSuccess: number | null;
  matchedPatterns: number;
  rank: number | null;
  status: OutcomeStatus;
  entry: number;
  maxRet: number; // best cumulative gain reached within the window (%)
  finalRet: number; // return at end of the elapsed window (%)
  daysToHit: number | null;
  daysElapsed: number;
  marketWindowRet: number; // cumulative market-avg return over the window (%)
  reason: MissReason | null;
}

export interface TargetSummary {
  target: string;
  label: string;
  settled: number;
  hits: number;
  hitRate: number | null;
  pending: number;
  avgProb: number | null;
}

export interface ReasonSummary {
  reason: MissReason;
  label: string;
  count: number;
  share: number;
}

export interface PredictionReviewData {
  outcomes: PredictionOutcome[];
  settled: number;
  hits: number;
  misses: number;
  pending: number;
  hitRate: number | null;
  byTarget: TargetSummary[];
  reasons: ReasonSummary[];
  worstMisses: PredictionOutcome[];
  bestHits: PredictionOutcome[];
  firstDate: string | null;
  lastScoreDate: string | null;
  lastSnapshotDate: string | null;
}

interface Series {
  dates: string[];
  closes: number[];
  rets: number[];
}

async function fetchAllWatchlist(): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; ; i++) {
    const res = await sb
      .from("ai_watchlist")
      .select(
        "score_date, symbol, company_name, sector, best_target, probability, hist_success_pct, matched_patterns, rank",
      )
      .gt("matched_patterns", 0)
      .order("score_date", { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1);
    const batch = res.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function fetchSnapshotsSince(minDate: string): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; ; i++) {
    const res = await sb
      .from("daily_snapshots")
      .select("symbol, snapshot_date, close, daily_return_pct")
      .gte("snapshot_date", minDate)
      .order("symbol", { ascending: true })
      .order("snapshot_date", { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1);
    const batch = res.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function classifyMiss(o: {
  finalRet: number;
  maxRet: number;
  threshold: number;
  marketWindowRet: number;
}): MissReason {
  if (o.marketWindowRet <= -1.5 && o.finalRet < 0) return "market";
  if (o.finalRet <= -5) return "decline";
  if (o.maxRet >= o.threshold * 0.7) return "close";
  if (o.maxRet - o.finalRet >= 5 && o.maxRet >= 3) return "faded";
  return "flat";
}

async function fetchPredictionReview(): Promise<PredictionReviewData> {
  const wl = await fetchAllWatchlist();
  if (wl.length === 0) {
    return {
      outcomes: [],
      settled: 0,
      hits: 0,
      misses: 0,
      pending: 0,
      hitRate: null,
      byTarget: [],
      reasons: [],
      worstMisses: [],
      bestHits: [],
      firstDate: null,
      lastScoreDate: null,
      lastSnapshotDate: null,
    };
  }

  const minDate = wl.reduce<string>((m, r) => (r.score_date < m ? r.score_date : m), wl[0].score_date);
  const snaps = await fetchSnapshotsSince(minDate);

  const bySymbol = new Map<string, Series>();
  const marketByDate = new Map<string, { sum: number; n: number }>();
  for (const r of snaps) {
    let s = bySymbol.get(r.symbol);
    if (!s) {
      s = { dates: [], closes: [], rets: [] };
      bySymbol.set(r.symbol, s);
    }
    s.dates.push(r.snapshot_date);
    s.closes.push(Number(r.close));
    const ret = r.daily_return_pct == null ? 0 : Number(r.daily_return_pct);
    s.rets.push(ret);
    if (r.daily_return_pct != null) {
      const agg = marketByDate.get(r.snapshot_date) ?? { sum: 0, n: 0 };
      agg.sum += ret;
      agg.n += 1;
      marketByDate.set(r.snapshot_date, agg);
    }
  }
  const marketRetByDate = new Map<string, number>();
  for (const [d, a] of marketByDate) marketRetByDate.set(d, a.n ? a.sum / a.n : 0);

  const lastSnapshotDate = snaps.length
    ? snaps.reduce<string>((m, r) => (r.snapshot_date > m ? r.snapshot_date : m), snaps[0].snapshot_date)
    : null;

  const outcomes: PredictionOutcome[] = [];
  for (const w of wl) {
    const target: string = w.best_target ?? "";
    const def = TARGET_DEFS[target];
    if (!def) continue;
    const series = bySymbol.get(w.symbol);
    if (!series) continue;
    const entryIdx = series.dates.indexOf(w.score_date);
    if (entryIdx < 0) continue;
    const entry = series.closes[entryIdx];
    if (!entry || Number.isNaN(entry)) continue;

    const lastIdx = series.dates.length - 1;
    const daysAvailable = lastIdx - entryIdx;
    const windowEnd = Math.min(entryIdx + def.horizon, lastIdx);
    const daysElapsed = Math.min(daysAvailable, def.horizon);

    let maxRet = 0;
    let finalRet = 0;
    let daysToHit: number | null = null;
    let marketWindowRet = 0;
    let hit = false;
    for (let i = entryIdx + 1; i <= windowEnd; i++) {
      const cum = (series.closes[i] / entry - 1) * 100;
      if (cum > maxRet) maxRet = cum;
      finalRet = cum;
      marketWindowRet += marketRetByDate.get(series.dates[i]) ?? 0;
      const dayN = i - entryIdx;
      if (def.daily) {
        if (!hit && series.rets[i] >= 9.5) {
          hit = true;
          daysToHit = dayN;
        }
      } else if (!hit && cum >= def.threshold) {
        hit = true;
        daysToHit = dayN;
      }
    }

    let status: OutcomeStatus;
    if (hit) status = "hit";
    else if (daysAvailable >= def.horizon) status = "miss";
    else status = "pending";

    const reason =
      status === "miss"
        ? classifyMiss({ finalRet, maxRet, threshold: def.threshold, marketWindowRet })
        : null;

    outcomes.push({
      symbol: w.symbol,
      company_name: w.company_name,
      sector: w.sector,
      score_date: w.score_date,
      target,
      targetLabel: def.label,
      horizon: def.horizon,
      threshold: def.threshold,
      probability: w.probability != null ? Number(w.probability) : null,
      histSuccess: w.hist_success_pct != null ? Number(w.hist_success_pct) : null,
      matchedPatterns: w.matched_patterns ?? 0,
      rank: w.rank ?? null,
      status,
      entry,
      maxRet,
      finalRet,
      daysToHit,
      daysElapsed,
      marketWindowRet,
      reason,
    });
  }

  const settledOutcomes = outcomes.filter((o) => o.status !== "pending");
  const hitsArr = outcomes.filter((o) => o.status === "hit");
  const missArr = outcomes.filter((o) => o.status === "miss");
  const pending = outcomes.filter((o) => o.status === "pending").length;
  const settled = settledOutcomes.length;
  const hits = hitsArr.length;
  const hitRate = settled ? (hits / settled) * 100 : null;

  // By-target breakdown
  const byTarget: TargetSummary[] = Object.keys(TARGET_DEFS).map((key) => {
    const grp = outcomes.filter((o) => o.target === key);
    const s = grp.filter((o) => o.status !== "pending");
    const h = grp.filter((o) => o.status === "hit").length;
    const probs = grp.map((o) => o.probability).filter((p): p is number => p != null);
    return {
      target: key,
      label: TARGET_DEFS[key].label,
      settled: s.length,
      hits: h,
      hitRate: s.length ? (h / s.length) * 100 : null,
      pending: grp.filter((o) => o.status === "pending").length,
      avgProb: probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : null,
    };
  });

  // Reason distribution
  const reasonCounts = new Map<MissReason, number>();
  for (const m of missArr) if (m.reason) reasonCounts.set(m.reason, (reasonCounts.get(m.reason) ?? 0) + 1);
  const reasons: ReasonSummary[] = [...reasonCounts.entries()]
    .map(([reason, count]) => ({
      reason,
      label: MISS_REASON_LABELS[reason],
      count,
      share: missArr.length ? (count / missArr.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const worstMisses = missArr.slice().sort((a, b) => a.finalRet - b.finalRet).slice(0, 20);
  const bestHits = hitsArr
    .slice()
    .sort((a, b) => (a.daysToHit ?? 99) - (b.daysToHit ?? 99) || b.maxRet - a.maxRet)
    .slice(0, 12);

  const scoreDates = [...new Set(outcomes.map((o) => o.score_date))].sort();

  return {
    outcomes,
    settled,
    hits,
    misses: missArr.length,
    pending,
    hitRate,
    byTarget,
    reasons,
    worstMisses,
    bestHits,
    firstDate: scoreDates[0] ?? null,
    lastScoreDate: scoreDates[scoreDates.length - 1] ?? null,
    lastSnapshotDate,
  };
}

export const predictionReviewQueryOptions = () =>
  queryOptions({
    queryKey: ["prediction-review"],
    queryFn: fetchPredictionReview,
    staleTime: 5 * 60_000,
  });
