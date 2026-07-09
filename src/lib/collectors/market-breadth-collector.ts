// ============================================================================
// MarketBreadthCollector — collects per-symbol daily rows and derives overall
// market breadth: advancers/decliners, advance-decline ratio, share of rising
// names, new highs/lows and the fraction trading above their moving average.
// Breadth is a classic "risk on / risk off" alt-data signal for the whole
// market that the ML pipeline can consume as a macro-context feature.
// ============================================================================

import { BaseCollector, isIsoDate } from "./base-collector";

export interface RawBreadthRow {
  symbol?: string;
  date?: string;
  ret_1d?: number | null; // %
  close?: number | null;
  ma20?: number | null;
  high_52w?: number | null;
  low_52w?: number | null;
}

export interface BreadthRow {
  symbol: string;
  date: string;
  ret1d: number | null;
  close: number | null;
  ma20: number | null;
  high52w: number | null;
  low52w: number | null;
}

export class MarketBreadthCollector extends BaseCollector<
  { date?: string },
  RawBreadthRow,
  BreadthRow
> {
  readonly id = "breadth";
  readonly label = "Piyasa Genişliği";

  protected reliability(): number {
    return 0.9;
  }

  protected map(raw: RawBreadthRow): BreadthRow | null {
    if (!raw.symbol || !raw.date) return null;
    return {
      symbol: raw.symbol,
      date: raw.date,
      ret1d: raw.ret_1d ?? null,
      close: raw.close ?? null,
      ma20: raw.ma20 ?? null,
      high52w: raw.high_52w ?? null,
      low52w: raw.low_52w ?? null,
    };
  }

  protected validate(item: BreadthRow): string[] {
    const issues: string[] = [];
    if (!item.symbol) issues.push("symbol eksik");
    if (!isIsoDate(item.date)) issues.push("geçersiz tarih");
    return issues;
  }

  protected qualityOf(item: BreadthRow): { completeness: number; ageDays: number | null } {
    const fields = [item.ret1d, item.close, item.ma20, item.high52w, item.low52w];
    const present = fields.filter((f) => f !== null).length;
    return { completeness: present / fields.length, ageDays: 0 };
  }

  protected dedupeKey(item: BreadthRow): string {
    return `${item.symbol}:${item.date}`;
  }

  protected dateOf(item: BreadthRow): string | null {
    return item.date;
  }
}

export interface MarketBreadth {
  date: string | null;
  total: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  /** advancers / max(1, decliners). */
  advDeclRatio: number;
  /** % of names with a positive daily return. */
  pctAdvancing: number;
  newHighs: number;
  newLows: number;
  /** % of names trading above their 20-day moving average. */
  pctAboveMa: number;
  /** 0-100 composite breadth score (50 = neutral). */
  score: number;
}

/** Compute market breadth from a set of daily rows (deterministic). */
export function computeBreadth(rows: BreadthRow[]): MarketBreadth {
  const total = rows.length;
  let adv = 0;
  let dec = 0;
  let unch = 0;
  let newHighs = 0;
  let newLows = 0;
  let aboveMa = 0;
  let maCount = 0;
  let date: string | null = null;

  for (const r of rows) {
    if (r.date && (date === null || r.date > date)) date = r.date;
    if (r.ret1d != null) {
      if (r.ret1d > 0.01) adv++;
      else if (r.ret1d < -0.01) dec++;
      else unch++;
    }
    if (r.close != null && r.high52w != null && r.close >= r.high52w) newHighs++;
    if (r.close != null && r.low52w != null && r.close <= r.low52w) newLows++;
    if (r.close != null && r.ma20 != null) {
      maCount++;
      if (r.close > r.ma20) aboveMa++;
    }
  }

  const rated = adv + dec + unch || 1;
  const pctAdvancing = (adv / rated) * 100;
  const pctAboveMa = maCount ? (aboveMa / maCount) * 100 : 0;
  const advDeclRatio = adv / Math.max(1, dec);
  // Blend the three breadth dimensions into a 0-100 score.
  const score = Math.round(
    Math.max(0, Math.min(100, 0.5 * pctAdvancing + 0.3 * pctAboveMa + 0.2 * (advDeclRatio >= 1 ? 60 : 40))),
  );

  return {
    date,
    total,
    advancers: adv,
    decliners: dec,
    unchanged: unch,
    advDeclRatio,
    pctAdvancing,
    newHighs,
    newLows,
    pctAboveMa,
    score,
  };
}
