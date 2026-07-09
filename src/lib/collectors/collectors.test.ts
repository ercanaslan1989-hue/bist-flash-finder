import { describe, it, expect } from "vitest";

import {
  BaseCollector,
  KapCollector,
  NewsCollector,
  FinancialCollector,
  MacroCollector,
  SectorCollector,
  MarketBreadthCollector,
  classifyKap,
  classifyKapCategory,
  classifyNews,
  computeSectorStats,
  relativeToSector,
  computeBreadth,
  macroSnapshots,
  summarizeKap,
  buildAltFeatures,
  mergeAltFeatures,
  featureQuality,
  type RawKapDisclosure,
} from ".";

const noBackoff = { backoffMs: 0, timeoutMs: 50 };

// A tiny concrete collector to exercise the BaseCollector resilience core.
interface Row {
  id: string;
  date: string;
  value: number;
}
class TestCollector extends BaseCollector<void, Row, Row> {
  readonly id = "test";
  readonly label = "Test";
  protected map(r: Row) {
    return r;
  }
  protected validate(r: Row) {
    return Number.isFinite(r.value) ? [] : ["geçersiz değer"];
  }
  protected qualityOf() {
    return { completeness: 1, ageDays: 0 };
  }
  protected dedupeKey(r: Row) {
    return r.id;
  }
  protected dateOf(r: Row) {
    return r.date;
  }
}

describe("BaseCollector — resilience", () => {
  it("retries a flaky source and eventually succeeds", async () => {
    let calls = 0;
    const c = new TestCollector(async () => {
      calls++;
      if (calls < 3) throw new Error("network error");
      return [{ id: "a", date: "2026-01-01", value: 1 }];
    });
    const res = await c.collect(undefined, noBackoff);
    expect(calls).toBe(3);
    expect(res.ok).toBe(true);
    expect(res.stats.attempts).toBe(3);
    expect(res.errors.filter((e) => e.kind === "network")).toHaveLength(2);
  });

  it("captures a timeout without throwing", async () => {
    const c = new TestCollector(() => new Promise(() => {}));
    const res = await c.collect(undefined, { retries: 1, backoffMs: 0, timeoutMs: 20 });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.kind === "timeout")).toBe(true);
    expect(res.items).toHaveLength(0);
  });

  it("flags an empty result", async () => {
    const c = new TestCollector(async () => []);
    const res = await c.collect(undefined, noBackoff);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.kind === "empty")).toBe(true);
  });

  it("drops invalid rows and counts them", async () => {
    const c = new TestCollector(async () => [
      { id: "a", date: "2026-01-01", value: 1 },
      { id: "b", date: "2026-01-02", value: NaN },
    ]);
    const res = await c.collect(undefined, noBackoff);
    expect(res.stats.invalid).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it("deduplicates by key (last wins)", async () => {
    const c = new TestCollector(async () => [
      { id: "a", date: "2026-01-01", value: 1 },
      { id: "a", date: "2026-01-01", value: 9 },
    ]);
    const res = await c.collect(undefined, noBackoff);
    expect(res.stats.deduped).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].value).toBe(9);
  });

  it("orders items chronologically ascending", async () => {
    const c = new TestCollector(async () => [
      { id: "b", date: "2026-03-01", value: 2 },
      { id: "a", date: "2026-01-01", value: 1 },
      { id: "c", date: "2026-02-01", value: 3 },
    ]);
    const res = await c.collect(undefined, noBackoff);
    expect(res.items.map((i) => i.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("uses a deterministic injected clock for provenance", async () => {
    const c = new TestCollector(async () => [{ id: "a", date: "2026-01-01", value: 1 }]);
    const res = await c.collect(undefined, { ...noBackoff, now: () => 0 });
    expect(res.provenance.collectedAt).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("KapCollector — classification & sentiment", () => {
  it("classifies categories from Turkish titles", () => {
    expect(classifyKapCategory("Bedelsiz sermaye artırımı kararı")).toBe("bedelsiz");
    expect(classifyKapCategory("Şirket temettü dağıtımı")).toBe("temettu");
    expect(classifyKapCategory("Yeni ihale kazanıldı")).toBe("ihale");
    expect(classifyKapCategory("Pay geri alım programı")).toBe("geri_alim");
    expect(classifyKapCategory("Rutin bildirim")).toBe("diger");
  });

  it("scores positive/negative sentiment", () => {
    const pos = classifyKap("Rekor kâr ve güçlü büyüme açıklandı");
    expect(pos.sentiment).toBe("positive");
    const neg = classifyKap("Şirket zarar açıkladı, dava süreci başladı");
    expect(neg.sentiment).toBe("negative");
  });

  it("is deterministic (same input → same output)", () => {
    const a = classifyKap("Yeni sözleşme imzalandı");
    const b = classifyKap("Yeni sözleşme imzalandı");
    expect(a).toEqual(b);
  });

  it("collects and summarizes disclosures", async () => {
    const raw: RawKapDisclosure[] = [
      { symbol: "AAA", disclosure_date: "2026-01-02", title: "Rekor kâr" },
      { symbol: "AAA", disclosure_date: "2026-01-05", title: "Bedelsiz artırım" },
    ];
    const res = await new KapCollector(async () => raw).collect({}, noBackoff);
    expect(res.items).toHaveLength(2);
    const sum = summarizeKap("AAA", res.items);
    expect(sum.count).toBe(2);
    expect(sum.positive).toBeGreaterThan(0);
  });
});

describe("NewsCollector — sentiment & source reliability", () => {
  it("weights confidence by source reliability", () => {
    const trusted = classifyNews("Şirket rekor kâr açıkladı", null, "reuters");
    const unknown = classifyNews("Şirket rekor kâr açıkladı", null, "randomblog");
    expect(trusted.confidence).toBeGreaterThan(unknown.confidence);
  });

  it("summarizes news with confidence-weighted net score", async () => {
    const res = await new NewsCollector(async () => [
      { source: "aa", title: "Güçlü büyüme", published_at: "2026-01-01" },
      { source: "aa", title: "Zarar ve dava", published_at: "2026-01-02" },
    ]).collect({}, noBackoff);
    expect(res.items).toHaveLength(2);
  });
});

describe("FinancialCollector — health derivation", () => {
  it("derives ratios and a health score", async () => {
    const res = await new FinancialCollector(async () => [
      {
        symbol: "AAA",
        report_date: "2026-03-31",
        revenue: 120,
        revenue_prev: 100,
        net_income: 20,
        net_income_prev: 10,
        gross_profit: 48,
        total_equity: 100,
        total_assets: 200,
        total_debt: 50,
        operating_cash_flow: 15,
      },
    ]).collect({}, noBackoff);
    const f = res.items[0];
    expect(f.revenueGrowth).toBeCloseTo(20);
    expect(f.netMargin).toBeCloseTo((20 / 120) * 100);
    expect(f.leverage).toBeCloseTo(0.5);
    expect(f.healthScore).toBeGreaterThan(50);
  });
});

describe("MacroCollector — time series", () => {
  it("validates, orders and snapshots indicators", async () => {
    const res = await new MacroCollector(async () => [
      { indicator: "usdtry", date: "2026-01-02", value: 42 },
      { indicator: "usdtry", date: "2026-01-01", value: 40 },
      { indicator: "bogus", date: "2026-01-01", value: 1 },
    ]).collect({}, noBackoff);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].date).toBe("2026-01-01");
    const snaps = macroSnapshots(res.items);
    const usd = snaps.find((s) => s.indicator === "usdtry")!;
    expect(usd.latest).toBe(42);
    expect(usd.changePct).toBeCloseTo(5);
  });
});

describe("SectorCollector — sector analytics", () => {
  const rows = [
    { symbol: "AAA", sector: "Banka", date: "2026-01-01", ret_1d: 2, ret_5d: 5, ret_20d: 10, traded_value: 900 },
    { symbol: "BBB", sector: "Banka", date: "2026-01-01", ret_1d: 1, ret_5d: 3, ret_20d: 6, traded_value: 100 },
    { symbol: "CCC", sector: "Enerji", date: "2026-01-01", ret_1d: -1, ret_5d: -2, ret_20d: -4, traded_value: 500 },
  ];

  it("ranks sectors by momentum", async () => {
    const res = await new SectorCollector(async () => rows).collect({}, noBackoff);
    const stats = computeSectorStats(res.items);
    expect(stats[0].sector).toBe("Banka");
    expect(stats[0].rank).toBe(1);
    expect(stats[0].leaders[0]).toBe("AAA");
  });

  it("computes per-symbol relative performance and leadership", () => {
    const rel = relativeToSector(
      rows.map((r) => ({
        symbol: r.symbol,
        sector: r.sector,
        date: r.date,
        ret1d: r.ret_1d,
        ret5d: r.ret_5d,
        ret20d: r.ret_20d,
        tradedValue: r.traded_value,
      })),
    );
    const aaa = rel.find((r) => r.symbol === "AAA")!;
    expect(aaa.isLeader).toBe(true);
    expect(aaa.relative20d).toBeCloseTo(10 - 8);
  });
});

describe("MarketBreadthCollector — breadth", () => {
  it("computes advancers/decliners and score", () => {
    const b = computeBreadth([
      { symbol: "A", date: "2026-01-01", ret1d: 2, close: 10, ma20: 9, high52w: null, low52w: null },
      { symbol: "B", date: "2026-01-01", ret1d: -1, close: 5, ma20: 6, high52w: null, low52w: null },
      { symbol: "C", date: "2026-01-01", ret1d: 0, close: 8, ma20: 7, high52w: null, low52w: null },
    ]);
    expect(b.advancers).toBe(1);
    expect(b.decliners).toBe(1);
    expect(b.pctAboveMa).toBeCloseTo((2 / 3) * 100);
    expect(b.score).toBeGreaterThan(0);
  });
});

describe("Feature Store integration", () => {
  it("builds provenance-tracked alt features and merges by name", () => {
    const feats = buildAltFeatures({
      kap: { symbol: "AAA", count: 3, positive: 2, neutral: 1, negative: 0, netScore: 0.4, byCategory: {}, lastDate: "2026-01-01" },
      breadth: computeBreadth([{ symbol: "A", date: "2026-01-01", ret1d: 1, close: 10, ma20: 9, high52w: null, low52w: null }]),
    });
    expect(feats.length).toBeGreaterThan(0);
    for (const f of feats) {
      expect(f.provenance.source).toBeTruthy();
      expect(f.provenance.timestamp).toBeTruthy();
      expect(f.provenance.confidence).toBeGreaterThanOrEqual(0);
    }
    const merged = mergeAltFeatures({ rsi: 55 }, feats);
    expect(merged.rsi).toBe(55);
    expect(merged.kap_count_30d).toBe(3);

    const q = featureQuality(feats);
    expect(q.total).toBe(feats.length);
    expect(q.bySource.kap).toBeDefined();
  });

  it("masks low-confidence features on merge", () => {
    const feats = buildAltFeatures({
      news: { symbol: "AAA", count: 1, positive: 0, neutral: 1, negative: 0, netScore: 0, avgConfidence: 0.05, lastDate: "2026-01-01" },
    });
    const merged = mergeAltFeatures({}, feats, 0.3);
    expect(merged.news_net_sentiment).toBeNull();
  });
});
