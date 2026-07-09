// ============================================================================
// FinancialCollector — collects per-symbol fundamental figures and derives a
// standardised financial-health profile: revenue/net-income growth, EBITDA,
// gross/net margins, leverage, cash flow, ROE and ROA.
// ============================================================================

import { BaseCollector, daysBetween, isIsoDate } from "./base-collector";

export interface RawFinancial {
  symbol?: string;
  period?: string; // e.g. "2025-Q4" or a report date
  report_date?: string;
  revenue?: number | null;
  revenue_prev?: number | null;
  net_income?: number | null;
  net_income_prev?: number | null;
  ebitda?: number | null;
  gross_profit?: number | null;
  total_equity?: number | null;
  total_assets?: number | null;
  total_debt?: number | null;
  operating_cash_flow?: number | null;
}

/** A normalised fundamental snapshot for one reporting period. */
export interface FinancialSnapshot {
  symbol: string;
  period: string;
  date: string;
  revenueGrowth: number | null; // %
  netIncomeGrowth: number | null; // %
  ebitda: number | null;
  grossMargin: number | null; // %
  netMargin: number | null; // %
  leverage: number | null; // debt / equity
  cashFlow: number | null; // operating cash flow
  roe: number | null; // %
  roa: number | null; // %
  /** 0-100 composite health score derived from the ratios above. */
  healthScore: number;
  reasons: string[];
}

const growth = (cur: number | null | undefined, prev: number | null | undefined): number | null => {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
};

const margin = (num: number | null | undefined, den: number | null | undefined): number | null => {
  if (num == null || den == null || den === 0) return null;
  return (num / den) * 100;
};

/** Pure health-score derivation from the ratio set (0-100). */
export function financialHealth(f: {
  revenueGrowth: number | null;
  netIncomeGrowth: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  leverage: number | null;
  cashFlow: number | null;
  roe: number | null;
  roa: number | null;
}): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];
  const bump = (delta: number, reason: string) => {
    score += delta;
    if (Math.abs(delta) >= 4) reasons.push(reason);
  };

  if (f.revenueGrowth != null)
    bump(Math.max(-12, Math.min(12, f.revenueGrowth / 3)), `Gelir büyümesi %${f.revenueGrowth.toFixed(0)}`);
  if (f.netIncomeGrowth != null)
    bump(Math.max(-12, Math.min(12, f.netIncomeGrowth / 4)), `Net kâr büyümesi %${f.netIncomeGrowth.toFixed(0)}`);
  if (f.netMargin != null)
    bump(Math.max(-8, Math.min(10, f.netMargin / 2)), `Net marj %${f.netMargin.toFixed(1)}`);
  if (f.roe != null) bump(Math.max(-8, Math.min(10, f.roe / 3)), `Özsermaye kârlılığı %${f.roe.toFixed(0)}`);
  if (f.roa != null) bump(Math.max(-6, Math.min(8, f.roa / 2)), `Aktif kârlılığı %${f.roa.toFixed(0)}`);
  if (f.leverage != null) {
    const d = f.leverage > 2 ? -10 : f.leverage > 1 ? -4 : 4;
    bump(d, `Borçluluk (D/E) ${f.leverage.toFixed(2)}`);
  }
  if (f.cashFlow != null) bump(f.cashFlow > 0 ? 4 : -6, f.cashFlow > 0 ? "Pozitif nakit akışı" : "Negatif nakit akışı");

  return { score: Math.round(Math.max(0, Math.min(100, score))), reasons };
}

export class FinancialCollector extends BaseCollector<
  { symbol?: string },
  RawFinancial,
  FinancialSnapshot
> {
  readonly id = "financial";
  readonly label = "Finansal Veriler";

  protected reliability(): number {
    return 0.85;
  }

  protected map(raw: RawFinancial): FinancialSnapshot | null {
    const date = raw.report_date ?? "";
    if (!raw.symbol || !date) return null;
    const revenueGrowth = growth(raw.revenue, raw.revenue_prev);
    const netIncomeGrowth = growth(raw.net_income, raw.net_income_prev);
    const grossMargin = margin(raw.gross_profit, raw.revenue);
    const netMargin = margin(raw.net_income, raw.revenue);
    const leverage =
      raw.total_debt != null && raw.total_equity != null && raw.total_equity !== 0
        ? raw.total_debt / raw.total_equity
        : null;
    const roe = margin(raw.net_income, raw.total_equity);
    const roa = margin(raw.net_income, raw.total_assets);
    const ratios = {
      revenueGrowth,
      netIncomeGrowth,
      grossMargin,
      netMargin,
      leverage,
      cashFlow: raw.operating_cash_flow ?? null,
      roe,
      roa,
    };
    const health = financialHealth(ratios);
    return {
      symbol: raw.symbol,
      period: raw.period ?? date,
      date,
      ...ratios,
      ebitda: raw.ebitda ?? null,
      healthScore: health.score,
      reasons: health.reasons,
    };
  }

  protected validate(item: FinancialSnapshot): string[] {
    const issues: string[] = [];
    if (!item.symbol) issues.push("symbol eksik");
    if (!isIsoDate(item.date)) issues.push("geçersiz rapor tarihi");
    return issues;
  }

  protected qualityOf(item: FinancialSnapshot): { completeness: number; ageDays: number | null } {
    const fields = [
      item.revenueGrowth,
      item.netIncomeGrowth,
      item.ebitda,
      item.grossMargin,
      item.netMargin,
      item.leverage,
      item.cashFlow,
      item.roe,
      item.roa,
    ];
    const present = fields.filter((f) => f !== null).length;
    return {
      completeness: present / fields.length,
      ageDays: daysBetween(item.date, new Date().toISOString().slice(0, 10)),
    };
  }

  protected dedupeKey(item: FinancialSnapshot): string {
    return `${item.symbol}:${item.period}`;
  }

  protected dateOf(item: FinancialSnapshot): string | null {
    return item.date;
  }
}
