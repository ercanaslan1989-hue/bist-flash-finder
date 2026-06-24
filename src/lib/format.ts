export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `₺${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `₺${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `₺${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `₺${(n / 1e3).toFixed(1)}K`;
  return `₺${n.toFixed(0)}`;
}

export function fmtRatio(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}×`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  gain_10: "+10% move",
  gain_15: "+15% move",
  gain_20: "+20% move",
};
