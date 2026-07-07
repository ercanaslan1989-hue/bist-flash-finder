import type { ScoreContext } from "./types";

// Shared test fixture: a neutral, fully-populated context. Individual tests
// override only the fields they exercise, keeping expectations deterministic.
export function makeContext(overrides: Partial<ScoreContext> = {}): ScoreContext {
  return {
    symbol: "TEST",
    lastClose: 100,
    rsi: 55,
    macdStatus: "neutral",
    macdHist: 0,
    ema20: 100,
    ema50: 100,
    sma20: 100,
    bollingerPctB: 50,
    ret5d: 5,
    ret20d: 10,
    dailyReturn: 0.5,
    relStrength20d: 0,
    obv: "flat",
    volumeIncrease: 0,
    liquidityValue: 60_000_000,
    liquidityLevel: "medium",
    volatility: 40,
    marketCap: 5_000_000_000,
    sector: "Test",
    kapCount: 0,
    legacyAiScore: 50,
    ...overrides,
  };
}
