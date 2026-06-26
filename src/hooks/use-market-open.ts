import { useEffect, useState } from "react";

/** Istanbul wall-clock parts regardless of the viewer's timezone. */
function istanbulNow(): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[get("weekday")] ?? 0;
  const hour = parseInt(get("hour"), 10) || 0;
  const minute = parseInt(get("minute"), 10) || 0;
  return { day, minutes: hour * 60 + minute };
}

// BIST continuous session ~10:00–18:10 Istanbul, Mon–Fri.
const OPEN_MIN = 10 * 60;
const CLOSE_MIN = 18 * 60 + 10;

export function isMarketOpen(): boolean {
  const { day, minutes } = istanbulNow();
  if (day === 0 || day === 6) return false;
  return minutes >= OPEN_MIN && minutes <= CLOSE_MIN;
}

/** Re-evaluates market-open state every minute. */
export function useMarketOpen(): boolean {
  const [open, setOpen] = useState<boolean>(() => isMarketOpen());
  useEffect(() => {
    const id = setInterval(() => setOpen(isMarketOpen()), 60_000);
    return () => clearInterval(id);
  }, []);
  return open;
}

export const REFRESH_MS = 5 * 60_000;
