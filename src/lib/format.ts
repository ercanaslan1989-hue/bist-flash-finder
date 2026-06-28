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
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}

/** Date + time formatted in the Europe/Istanbul timezone. */
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

/** Short "26 Haziran" style date in Europe/Istanbul (no year). */
export function fmtDateShort(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Istanbul",
  });
}

/** Today's date as YYYY-MM-DD in the Europe/Istanbul timezone. */
export function istanbulToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True when a data date (YYYY-MM-DD) is older than today in Istanbul. */
export function isStaleDate(d: string | null | undefined): boolean {
  if (!d) return false;
  return d.slice(0, 10) < istanbulToday();
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  gain_10: "+%10 hareket",
  gain_15: "+%15 hareket",
  gain_20: "+%20 hareket",
};
