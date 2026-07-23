// Portföy takibi — tamamen tarayıcı localStorage'da. Backend gerekmez.
// Kullanıcı "Aldım" derse buraya kaydedilir, "Sattım" derse geçmişe taşınır.

const KEY_ACTIVE = "bsl_portfolio_active_v1";
const KEY_HISTORY = "bsl_portfolio_history_v1";

export interface Holding {
  symbol: string;
  companyName: string | null;
  buyDate: string; // ISO
  buyPrice: number;
  targetPct: number; // % hedef (ör 15)
  confidence: number; // 0-100
}

export interface ClosedTrade extends Holding {
  sellDate: string;
  sellPrice: number;
  returnPct: number;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadActive(): Holding[] {
  if (typeof window === "undefined") return [];
  return safeParse<Holding[]>(localStorage.getItem(KEY_ACTIVE), []);
}

export function loadHistory(): ClosedTrade[] {
  if (typeof window === "undefined") return [];
  return safeParse<ClosedTrade[]>(localStorage.getItem(KEY_HISTORY), []);
}

function saveActive(rows: Holding[]) {
  localStorage.setItem(KEY_ACTIVE, JSON.stringify(rows));
  window.dispatchEvent(new Event("portfolio-changed"));
}

function saveHistory(rows: ClosedTrade[]) {
  localStorage.setItem(KEY_HISTORY, JSON.stringify(rows));
  window.dispatchEvent(new Event("portfolio-changed"));
}

export function addHolding(h: Holding) {
  const list = loadActive().filter((x) => x.symbol !== h.symbol);
  list.push(h);
  saveActive(list);
}

export function removeHolding(symbol: string, sellPrice: number) {
  const list = loadActive();
  const found = list.find((x) => x.symbol === symbol);
  if (!found) return;
  const returnPct = ((sellPrice - found.buyPrice) / found.buyPrice) * 100;
  const closed: ClosedTrade = {
    ...found,
    sellDate: new Date().toISOString(),
    sellPrice,
    returnPct,
  };
  saveActive(list.filter((x) => x.symbol !== symbol));
  saveHistory([closed, ...loadHistory()].slice(0, 200));
}

export function isHeld(symbol: string): boolean {
  return loadActive().some((x) => x.symbol === symbol);
}

export interface PortfolioSummary {
  totalReturnPct: number;
  hitRate: number | null;
  closedCount: number;
  activeCount: number;
}

export function summarize(active: Holding[], history: ClosedTrade[], livePrices: Map<string, number>): PortfolioSummary {
  const activePnl = active.reduce((a, h) => {
    const p = livePrices.get(h.symbol);
    if (!p) return a;
    return a + ((p - h.buyPrice) / h.buyPrice) * 100;
  }, 0);
  const closedPnl = history.reduce((a, t) => a + t.returnPct, 0);
  const totalCount = active.length + history.length;
  const totalReturnPct = totalCount ? (activePnl + closedPnl) / totalCount : 0;
  const hits = history.filter((t) => t.returnPct >= t.targetPct * 0.8).length;
  const hitRate = history.length ? hits / history.length : null;
  return { totalReturnPct, hitRate, closedCount: history.length, activeCount: active.length };
}
