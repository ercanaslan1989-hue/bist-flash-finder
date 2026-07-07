// LabelGenerator — labels use ONLY future data and are null when unsettled.

import { describe, it, expect } from "vitest";
import { generateLabels } from "./label-generator";
import { makeSymbol, uptrend } from "@/lib/backtest/fixtures";

describe("label generation (look-ahead free)", () => {
  it("labels at index i are unchanged by history before i", () => {
    const closes = [...Array(50).fill(100), 110, 121, 133.1, 140, 150];
    const sym = makeSymbol(closes);
    const l = generateLabels(sym, 49, 0);
    // +10% next day → up=1, forwardReturn≈10.
    expect(l[1].up).toBe(1);
    expect(l[1].forwardReturn).toBeCloseTo(10, 5);
    expect(l[3].up).toBe(1);
  });

  it("labels are null when the horizon exceeds available future", () => {
    const closes = uptrend(52, 100, 1); // 2 sessions after index 49
    const sym = makeSymbol(closes);
    const l = generateLabels(sym, 49, 0);
    expect(l[1].up).not.toBeNull();
    expect(l[10].up).toBeNull();
    expect(l[20].forwardReturn).toBeNull();
  });

  it("down move produces up=0", () => {
    const closes = [...Array(50).fill(100), 90];
    const sym = makeSymbol(closes);
    const l = generateLabels(sym, 49, 0);
    expect(l[1].up).toBe(0);
    expect(l[1].forwardReturn).toBeCloseTo(-10, 5);
  });

  it("future prices never change the label at i (poison test)", () => {
    const base = [...Array(50).fill(100), 105];
    const symA = makeSymbol([...base, 200, 200]);
    const symB = makeSymbol([...base, 50, 50]);
    // Horizon 1 uses only close[50] which is identical in both.
    expect(generateLabels(symA, 49, 0)[1]).toEqual(generateLabels(symB, 49, 0)[1]);
  });
});
