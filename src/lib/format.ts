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

/** "26 Haziran 2026 • 15:35 (TSİ)" — date + time in Europe/Istanbul. */
export function fmtUpdatedTSI(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
  const timePart = date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
  return `${datePart} • ${timePart} (TSİ)`;
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

// ===== Trading-calendar–aware data freshness =====

const CLOSE_MIN = 18 * 60 + 15; // BIST close ~18:10 TSİ (+ buffer)

/** Istanbul "now" parts: date (YYYY-MM-DD) and minutes-of-day. */
function istanbulNowParts(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = (parseInt(get("hour"), 10) || 0) * 60 + (parseInt(get("minute"), 10) || 0);
  return { date, minutes };
}

const isWeekday = (d: Date) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;

/** Most recent BIST session whose close has already passed (YYYY-MM-DD). */
function expectedLatestSession(): string {
  const now = istanbulNowParts();
  const d = new Date(now.date + "T00:00:00Z");
  const todayClosed = isWeekday(d) && now.minutes >= CLOSE_MIN;
  if (!todayClosed) d.setUTCDate(d.getUTCDate() - 1);
  while (!isWeekday(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Number of completed trading sessions the data is behind. */
export function tradingDaysBehind(d: string | null | undefined): number {
  if (!d) return 0;
  const snap = d.slice(0, 10);
  const expected = expectedLatestSession();
  if (snap >= expected) return 0;
  let count = 0;
  const cur = new Date(snap + "T00:00:00Z");
  cur.setUTCDate(cur.getUTCDate() + 1);
  const end = new Date(expected + "T00:00:00Z");
  while (cur <= end) {
    if (isWeekday(cur)) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export type FreshnessTier = "fresh" | "warn" | "critical";

export interface Freshness {
  tier: FreshnessTier;
  /** Trading sessions behind the latest expected close. */
  behind: number;
  /** Short banner title, empty when fresh. */
  label: string;
}

/**
 * Trading-calendar–aware freshness for a data date (snapshot_date).
 * - fresh: up to date (weekends/holidays ignored)
 * - warn (sarı): ~1 session behind → "Veriler güncel değil"
 * - critical (kırmızı): ≥2 sessions behind → "Veri akışı durmuş olabilir"
 */
export function dataFreshness(d: string | null | undefined): Freshness {
  const behind = tradingDaysBehind(d);
  if (behind <= 0) return { tier: "fresh", behind, label: "" };
  if (behind === 1) return { tier: "warn", behind, label: "Veriler güncel değil" };
  return { tier: "critical", behind, label: "Veri akışı durmuş olabilir" };
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  gain_10: "+%10 hareket",
  gain_15: "+%15 hareket",
  gain_20: "+%20 hareket",
};
