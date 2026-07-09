// ============================================================================
// MacroCollector — collects macro indicators as chronological time series:
// USD/TRY, EUR/TRY, policy rate, CDS, gold, oil, BIST100, BIST30, VİOP.
// Each indicator is validated for date order and stored as a clean series.
// ============================================================================

import { BaseCollector, daysBetween, isIsoDate } from "./base-collector";

/** Supported macro indicators. */
export type MacroIndicator =
  | "usdtry"
  | "eurtry"
  | "policy_rate"
  | "cds"
  | "gold"
  | "oil"
  | "bist100"
  | "bist30"
  | "viop";

export const MACRO_LABELS: Record<MacroIndicator, string> = {
  usdtry: "USD/TRY",
  eurtry: "EUR/TRY",
  policy_rate: "Politika Faizi",
  cds: "CDS (5Y)",
  gold: "Altın (ONS)",
  oil: "Petrol (Brent)",
  bist100: "BIST 100",
  bist30: "BIST 30",
  viop: "VİOP-30",
};

export const MACRO_INDICATORS = Object.keys(MACRO_LABELS) as MacroIndicator[];

export interface RawMacro {
  indicator?: string;
  date?: string;
  value?: number | null;
}

/** One point in a macro time series. */
export interface MacroPoint {
  indicator: MacroIndicator;
  date: string;
  value: number;
}

const isMacroIndicator = (s: unknown): s is MacroIndicator =>
  typeof s === "string" && (MACRO_INDICATORS as string[]).includes(s);

export class MacroCollector extends BaseCollector<
  { indicators?: MacroIndicator[]; since?: string },
  RawMacro,
  MacroPoint
> {
  readonly id = "macro";
  readonly label = "Makro Göstergeler";

  protected reliability(): number {
    return 0.9;
  }

  protected map(raw: RawMacro): MacroPoint | null {
    if (!isMacroIndicator(raw.indicator) || !raw.date || raw.value == null) return null;
    if (!Number.isFinite(raw.value)) return null;
    return { indicator: raw.indicator, date: raw.date, value: raw.value };
  }

  protected validate(item: MacroPoint): string[] {
    const issues: string[] = [];
    if (!isMacroIndicator(item.indicator)) issues.push("bilinmeyen gösterge");
    if (!isIsoDate(item.date)) issues.push("geçersiz tarih");
    if (!Number.isFinite(item.value)) issues.push("geçersiz değer");
    if (item.value < 0 && item.indicator !== "policy_rate") issues.push("negatif değer");
    return issues;
  }

  protected qualityOf(item: MacroPoint): { completeness: number; ageDays: number | null } {
    return {
      completeness: 1,
      ageDays: daysBetween(item.date, new Date().toISOString().slice(0, 10)),
    };
  }

  protected dedupeKey(item: MacroPoint): string {
    return `${item.indicator}:${item.date}`;
  }

  protected dateOf(item: MacroPoint): string | null {
    return item.date;
  }
}

/** Group a flat macro series into per-indicator, chronologically-ordered series. */
export function groupMacroSeries(points: MacroPoint[]): Record<string, MacroPoint[]> {
  const out: Record<string, MacroPoint[]> = {};
  for (const p of points) (out[p.indicator] ??= []).push(p);
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

export interface MacroSnapshot {
  indicator: MacroIndicator;
  label: string;
  latest: number | null;
  previous: number | null;
  changePct: number | null;
  date: string | null;
}

/** Latest value + period-over-period change for each indicator. */
export function macroSnapshots(points: MacroPoint[]): MacroSnapshot[] {
  const grouped = groupMacroSeries(points);
  return MACRO_INDICATORS.map((ind) => {
    const series = grouped[ind] ?? [];
    const latest = series[series.length - 1] ?? null;
    const previous = series[series.length - 2] ?? null;
    const changePct =
      latest && previous && previous.value !== 0
        ? ((latest.value - previous.value) / previous.value) * 100
        : null;
    return {
      indicator: ind,
      label: MACRO_LABELS[ind],
      latest: latest?.value ?? null,
      previous: previous?.value ?? null,
      changePct,
      date: latest?.date ?? null,
    };
  });
}
