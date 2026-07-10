import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Activity, Gauge, Layers, LineChart, Megaphone, Newspaper, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { marketIntelQueryOptions } from "@/lib/collectors/market-intel-data";
import { KAP_CATEGORY_LABELS, type KapCategory } from "@/lib/collectors";
import { altFeatureLabel, altFeatureNames } from "@/lib/collectors";
import { fmtNum, fmtPct, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/market-intelligence")({
  head: () => ({
    meta: [
      { title: "Market Intelligence — BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "Fiyat verisinin ötesinde alternatif veri: KAP bildirim duyarlılığı, haber duyarlılığı, makro göstergeler, sektör sıralaması, piyasa genişliği ve veri kalitesi. Yalnızca araştırma amaçlıdır.",
      },
      { property: "og:title", content: "Market Intelligence — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Alternatif veri ve duyarlılık motoru: KAP, haber, makro, sektör ve piyasa genişliği tek ekranda.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketIntelQueryOptions()),
  component: MarketIntelligencePage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Market Intelligence yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Veri bulunamadı.</p>
    </AppShell>
  ),
});

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-success/15 text-success border-success/30",
  negative: "bg-destructive/15 text-destructive border-destructive/30",
  neutral: "bg-secondary text-muted-foreground border-border",
};
const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Pozitif",
  negative: "Negatif",
  neutral: "Nötr",
};

function MarketIntelligencePage() {
  const { data } = useSuspenseQuery(marketIntelQueryOptions());

  const kapByCategory = useMemo(() => {
    const map = new Map<KapCategory, number>();
    for (const d of data.kap) map.set(d.category, (map.get(d.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.kap]);

  const populated = data.kap.length > 0 || data.sectors.length > 0;

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Activity className="h-3.5 w-3.5" /> Alternatif Veri Motoru
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Market <span className="text-primary">Intelligence</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Fiyatın ötesindeki sinyaller: KAP bildirimleri, haber duyarlılığı, makro göstergeler,
            sektör gücü ve piyasa genişliği. Tüm veriler kaynak, zaman damgası ve güven skoruyla
            saklanır ve ML modellerine otomatik beslenir. Yalnızca araştırma amaçlıdır.
          </p>
          {data.lastDate && (
            <p className="mt-3 text-xs text-muted-foreground">
              Son veri günü: <span className="font-mono text-foreground">{fmtDate(data.lastDate)}</span>
            </p>
          )}
        </div>
      </section>

      {!populated && (
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Alternatif veri kaynakları henüz beslenmedi.</span>{" "}
          Toplayıcı katmanı hazır — KAP, haber ve makro kaynakları bağlandığı anda bu ekran otomatik
          dolacaktır.
        </div>
      )}

      {/* Market breadth */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BreadthCard label="Piyasa Genişliği" value={fmtNum(data.breadth.score)} sub="0-100 skor" accent />
        <BreadthCard
          label="Yükselen / Düşen"
          value={`${data.breadth.advancers} / ${data.breadth.decliners}`}
          sub={`A/D ${data.breadth.advDeclRatio.toFixed(2)}`}
        />
        <BreadthCard
          label="Yükselen Oranı"
          value={`${data.breadth.pctAdvancing.toFixed(0)}%`}
          sub={`${data.breadth.total} hisse`}
        />
        <BreadthCard
          label="MA20 Üstü"
          value={`${data.breadth.pctAboveMa.toFixed(0)}%`}
          sub="hareketli ort. üstünde"
        />
      </section>

      {/* Macro indicators */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Makro göstergeler</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.macro.map((m) => (
            <div key={m.indicator} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </p>
                {m.changePct != null && (
                  <span
                    className={cn(
                      "font-mono text-xs font-semibold tabular",
                      m.changePct >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {m.changePct >= 0 ? "▲" : "▼"} {Math.abs(m.changePct).toFixed(2)}%
                  </span>
                )}
              </div>
              <p className="mt-1 font-display text-2xl font-bold tabular text-foreground">
                {m.latest != null ? fmtNum(m.latest) : "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {m.date ? fmtDate(m.date) : "veri yok"}
              </p>
            </div>
          ))}
          {data.macro.every((m) => m.latest == null) && (
            <p className="text-sm text-muted-foreground">Makro göstergesi henüz beslenmedi.</p>
          )}
        </div>
      </section>

      {/* Sector ranking */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Sektör sıralaması</h2>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Sektör</th>
                <th className="px-3 py-2.5 text-right font-medium">Güç (1g)</th>
                <th className="px-3 py-2.5 text-right font-medium">Momentum (20g)</th>
                <th className="px-3 py-2.5 text-right font-medium">Üye</th>
                <th className="px-3 py-2.5 font-medium">Liderler</th>
              </tr>
            </thead>
            <tbody>
              {data.sectors.slice(0, 20).map((s, idx) => (
                <tr key={s.sector} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{s.rank}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{s.sector}</td>
                  <td className={cn("px-3 py-2.5 text-right font-mono tabular", (s.strength ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                    {fmtPct(s.strength)}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right font-mono font-semibold tabular", (s.momentum ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                    {fmtPct(s.momentum)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">{s.members}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{s.leaders.join(", ")}</td>
                </tr>
              ))}
              {data.sectors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Sektör verisi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* KAP disclosures */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-chart-4" />
          <h2 className="font-display text-xl font-bold text-foreground">Son KAP açıklamaları</h2>
        </div>
        {kapByCategory.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {kapByCategory.map(([cat, count]) => (
              <span key={cat} className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                {KAP_CATEGORY_LABELS[cat]} <span className="font-mono text-foreground">{count}</span>
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Tarih</th>
                <th className="px-3 py-2.5 font-medium">Hisse</th>
                <th className="px-3 py-2.5 font-medium">Kategori</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Başlık</th>
                <th className="px-3 py-2.5 text-right font-medium">Duyarlılık</th>
              </tr>
            </thead>
            <tbody>
              {data.kap.slice(0, 30).map((d, idx) => (
                <tr key={d.id} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">{fmtDate(d.date)}</td>
                  <td className="px-3 py-2.5 font-mono font-medium text-foreground">{d.symbol}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.categoryLabel}</td>
                  <td className="hidden max-w-[360px] truncate px-3 py-2.5 text-muted-foreground sm:table-cell">{d.title}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", SENTIMENT_STYLES[d.sentiment])}>
                      {SENTIMENT_LABELS[d.sentiment]}
                    </span>
                  </td>
                </tr>
              ))}
              {data.kap.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    KAP bildirimi bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Alt-data features registered for the Feature Store / ML */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">Feature Store — alternatif veri</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Aşağıdaki alternatif veri feature'ları kaynak, zaman damgası ve güven skoruyla saklanır ve
          mevcut ML modelleri tarafından otomatik kullanılabilir.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {altFeatureNames().map((name) => (
            <span key={name} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
              <Newspaper className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground">{altFeatureLabel(name)}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{name}</span>
            </span>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function BreadthCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", accent ? "border-primary/40" : "border-border")}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold tabular", accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
