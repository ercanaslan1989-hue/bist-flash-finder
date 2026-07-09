// ============================================================================
// SectorCollector — collects per-symbol daily performance rows and derives
// sector-level analytics: sector strength, momentum, per-stock relative
// performance vs its sector, and sector leadership (top contributors).
// ============================================================================

import { BaseCollector, isIsoDate } from "./base-collector";

export interface RawSectorRow {
  symbol?: string;
  sector?: string | null;
  date?: string;
  ret_1d?: number | null; // daily return %
  ret_5d?: number | null;
  ret_20d?: number | null;
  traded_value?: number | null;
}

export interface SectorRow {
  symbol: string;
  sector: string;
  date: string;
  ret1d: number | null;
  ret5d: number | null;
  ret20d: number | null;
  tradedValue: number | null;
}

export class SectorCollector extends BaseCollector<
  { date?: string },
  RawSectorRow,
  SectorRow
> {
  readonly id = "sector";
  readonly label = "Sektör Analizi";

  protected reliability(): number {
    return 0.9;
  }

  protected map(raw: RawSectorRow): SectorRow | null {
    if (!raw.symbol || !raw.date) return null;
    return {
      symbol: raw.symbol,
      sector: raw.sector ?? "Bilinmiyor",
      date: raw.date,
      ret1d: raw.ret_1d ?? null,
      ret5d: raw.ret_5d ?? null,
      ret20d: raw.ret_20d ?? null,
      tradedValue: raw.traded_value ?? null,
    };
  }

  protected validate(item: SectorRow): string[] {
    const issues: string[] = [];
    if (!item.symbol) issues.push("symbol eksik");
    if (!isIsoDate(item.date)) issues.push("geçersiz tarih");
    return issues;
  }

  protected qualityOf(item: SectorRow): { completeness: number; ageDays: number | null } {
    const fields = [item.ret1d, item.ret5d, item.ret20d, item.tradedValue];
    const present = fields.filter((f) => f !== null).length;
    return { completeness: present / fields.length, ageDays: 0 };
  }

  protected dedupeKey(item: SectorRow): string {
    return `${item.symbol}:${item.date}`;
  }

  protected dateOf(item: SectorRow): string | null {
    return item.date;
  }
}

// ===== Sector analytics (pure) =====

function mean(xs: number[]): number | null {
  const v = xs.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export interface SectorStats {
  sector: string;
  members: number;
  /** Mean 1-day return (%) — "strength" today. */
  strength: number | null;
  /** Mean 20-day return (%) — momentum. */
  momentum: number | null;
  /** Mean 5-day return (%). */
  mid: number | null;
  /** Total traded value (liquidity/leadership proxy). */
  tradedValue: number;
  /** Rank by momentum (1 = strongest), filled by rankSectors. */
  rank: number;
  /** Top contributing symbols by traded value. */
  leaders: string[];
}

/** Aggregate sector-level statistics from per-symbol rows. */
export function computeSectorStats(rows: SectorRow[]): SectorStats[] {
  const bySector = new Map<string, SectorRow[]>();
  for (const r of rows) {
    const arr = bySector.get(r.sector) ?? [];
    arr.push(r);
    bySector.set(r.sector, arr);
  }
  const stats: SectorStats[] = [];
  for (const [sector, members] of bySector) {
    const leaders = [...members]
      .sort((a, b) => (b.tradedValue ?? 0) - (a.tradedValue ?? 0))
      .slice(0, 3)
      .map((m) => m.symbol);
    stats.push({
      sector,
      members: members.length,
      strength: mean(members.map((m) => m.ret1d ?? NaN)),
      momentum: mean(members.map((m) => m.ret20d ?? NaN)),
      mid: mean(members.map((m) => m.ret5d ?? NaN)),
      tradedValue: members.reduce((a, b) => a + (b.tradedValue ?? 0), 0),
      rank: 0,
      leaders,
    });
  }
  return rankSectors(stats);
}

/** Rank sectors by momentum (desc); ties broken by strength. */
export function rankSectors(stats: SectorStats[]): SectorStats[] {
  const sorted = [...stats].sort((a, b) => {
    const bm = b.momentum ?? -Infinity;
    const am = a.momentum ?? -Infinity;
    if (bm !== am) return bm - am;
    return (b.strength ?? -Infinity) - (a.strength ?? -Infinity);
  });
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
}

export interface RelativePerformance {
  symbol: string;
  sector: string;
  /** Stock 20d return minus its sector's mean 20d return (%). */
  relative20d: number | null;
  /** Stock 5d return minus sector mean (%). */
  relative5d: number | null;
  /** True when the symbol is the top traded-value name in its sector. */
  isLeader: boolean;
}

/** Per-symbol relative performance vs its own sector. */
export function relativeToSector(rows: SectorRow[]): RelativePerformance[] {
  const stats = computeSectorStats(rows);
  const statMap = new Map(stats.map((s) => [s.sector, s]));
  return rows.map((r) => {
    const s = statMap.get(r.sector);
    return {
      symbol: r.symbol,
      sector: r.sector,
      relative20d:
        r.ret20d != null && s?.momentum != null ? r.ret20d - s.momentum : null,
      relative5d: r.ret5d != null && s?.mid != null ? r.ret5d - s.mid : null,
      isLeader: s?.leaders[0] === r.symbol,
    };
  });
}
