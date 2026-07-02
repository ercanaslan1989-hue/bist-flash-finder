import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Database,
  Flame,
  Layers,
  Megaphone,
  TrendingUp,
  Zap,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { OpportunitiesCard } from "@/components/opportunities-card";
import { StatCard } from "@/components/stat-card";
import { DistributionBars } from "@/components/distribution-bars";
import { researchQueryOptions } from "@/lib/research";
import {
  filterFeatures,
  kapBuckets,
  preEventProfile,
  returnBuckets,
  sectorBuckets,
  topPatterns,
  volumeRatioBuckets,
} from "@/lib/analysis";
import { fmtDate, fmtDateShort, fmtNum, fmtPct, fmtRatio, dataFreshness } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BIST Sinyal Araştırma Lab — Olay Analizi Paneli" },
      {
        name: "description",
        content:
          "BIST hisseleri büyük hareket yapmadan veya tavana ulaşmadan önce hangi sinyallerin ortaya çıktığını keşfedin. Her olaydan önce hacim, getiri, KAP hareketliliği ve sektör kalıpları ölçülür.",
      },
      { property: "og:title", content: "BIST Sinyal Araştırma Lab — Olay Analizi" },
      {
        property: "og:description",
        content: "Büyük BIST fiyat hareketlerinden önce en sık tekrarlayan en yüksek olasılıklı kurulumlar.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(researchQueryOptions()),
  component: Dashboard,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Araştırma verileri yüklenemedi</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Araştırma verisi bulunamadı.</p>
    </AppShell>
  ),
});

const WINDOWS = [
  { value: 1, label: "1 gün önce" },
  { value: 2, label: "2 gün önce" },
  { value: 3, label: "3 gün önce" },
  { value: 5, label: "5 gün önce" },
  { value: 10, label: "10 gün önce" },
  { value: 0, label: "Tüm dönemler" },
] as const;

function Dashboard() {
  const { data } = useSuspenseQuery(researchQueryOptions());
  const router = useRouter();
  const [win, setWin] = useState<number>(0);

  const { events, features, meta } = data;
  const windowFeatures = filterFeatures(features, win);
  const patterns = topPatterns(windowFeatures, events);
  const profile = preEventProfile(windowFeatures);
  const sectors = sectorBuckets(events);
  const limitUps = events.filter((e) => e.is_limit_up).length;

  if (events.length === 0) {
    return (
      <AppShell>
        <EmptyState onRefresh={() => router.invalidate()} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Flame className="h-3.5 w-3.5" /> Olay Analizi
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Bir hisse büyük hareket yapmadan <span className="text-primary">önce</span> hangi sinyaller ortaya çıkıyor?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            BIST'te bir hisse tek seansta en fazla ±%10 hareket edebilir. Bu laboratuvar her hisse için
            günlük veri toplar; tek seans <span className="text-foreground">tavan (+%10)</span> günlerini
            ve birkaç işlem gününde biriken <span className="text-foreground">+%15 / +%20</span> yükselişleri
            olay olarak işaretler, ardından 1–10 işlem günü öncesinde tekrarlayan koşulları ölçer.
            Al/sat sinyali yoktur — yalnızca kalıplar.
          </p>

        </div>
      </section>

      {/* Coverage stats */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Takip edilen hisseler" value={fmtNum(meta.stockCount)} icon={<Layers className="h-4 w-4" />} />
        <StatCard
          label="Günlük veriler"
          value={fmtNum(meta.snapshotCount)}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          label="Tespit edilen hareketler"
          value={fmtNum(events.length)}
          accent="primary"
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Tavan günleri"
          value={fmtNum(limitUps)}
          accent="accent"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Analiz dönemi"
          value={<span className="text-base">{fmtDate(meta.firstDate)}</span>}
          sub={(() => {
            const fresh = dataFreshness(meta.lastDate);
            if (fresh.tier === "critical")
              return (
                <span className="text-destructive">
                  {fmtDate(meta.lastDate)} tarihine kadar · {fresh.label} (son veri:{" "}
                  {fmtDateShort(meta.lastDate)})
                </span>
              );
            if (fresh.tier === "warn")
              return (
                <span className="text-warning">
                  {fmtDate(meta.lastDate)} tarihine kadar · {fresh.label} (son veri:{" "}
                  {fmtDateShort(meta.lastDate)})
                </span>
              );
            return `${fmtDate(meta.lastDate)} tarihine kadar`;
          })()}
          icon={<CalendarDays className="h-4 w-4" />}
        />

      </section>

      {/* Daily opportunities */}
      <OpportunitiesCard />

      {/* Top recurring patterns */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl font-bold text-foreground">En sık tekrarlayan kalıplar</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Büyük hareketler öncesinde her bir koşulun ne sıklıkta görüldüğü.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {patterns.map((p, i) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                <span className="font-mono text-2xl font-semibold text-primary tabular">
                  {p.share.toFixed(0)}%
                </span>
              </div>
              <h3 className="mt-3 font-display text-sm font-semibold leading-snug text-foreground">
                {p.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lookback selector */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <h2 className="font-display text-xl font-bold text-foreground">Olay öncesi dağılımlar</h2>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => setWin(w.value)}
                className={
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                  (win === w.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <DistributionBars
            title="20 günlük ortalamaya göre hacim oranı"
            subtitle="Büyük hareketler öncesinde en sık görülen hacim koşulları"
            buckets={volumeRatioBuckets(windowFeatures)}
            barClass="bg-primary"
            icon={<Activity className="h-4 w-4" />}
          />
          <DistributionBars
            title="KAP bildirim hareketliliği"
            subtitle="Büyük hareketler öncesi dönemdeki bildirim sayıları"
            buckets={kapBuckets(windowFeatures)}
            barClass="bg-chart-4"
            icon={<Megaphone className="h-4 w-4" />}
          />
          <DistributionBars
            title="5 günlük getiri"
            subtitle="Büyük hareketler öncesi son 5 seanslık yönelim"
            buckets={returnBuckets(windowFeatures, "ret_5d")}
            barClass="bg-accent"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <DistributionBars
            title="10 günlük getiri"
            subtitle="Büyük hareketler öncesi son 10 seanslık yönelim"
            buckets={returnBuckets(windowFeatures, "ret_10d")}
            barClass="bg-success"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* Sector + profile */}
      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <DistributionBars
          title="Büyük hareketler öncesi sektörler"
          subtitle="Olayların sektörlere göre dağılımı"
          buckets={sectors.slice(0, 8)}
          barClass="bg-chart-2"
          icon={<Layers className="h-4 w-4" />}
        />

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-sm font-semibold text-foreground">Tipik olay öncesi profil</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Seçili döneme ait medyan ve ortalama
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Metrik</th>
                  <th className="px-3 py-2 text-right font-medium">Medyan</th>
                  <th className="px-3 py-2 text-right font-medium">Ortalama</th>
                </tr>
              </thead>
              <tbody>
                {profile.map((row, idx) => (
                  <tr key={row.metric} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
                    <td className="px-3 py-2 text-foreground">{row.metric}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground tabular">
                      {formatProfile(row.median, row.unit)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular">
                      {formatProfile(row.average, row.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function formatProfile(v: number | null, unit: "ratio" | "pct" | "num") {
  if (v === null) return "—";
  if (unit === "ratio") return fmtRatio(v);
  if (unit === "pct") return fmtPct(v);
  return fmtNum(v, 2);
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <Flame className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 font-display text-lg font-semibold text-foreground">Henüz olay yok</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Günlük veriler büyük hareketler içermeye başladığında, olaylar ve olay öncesi kalıplar burada görünür.
      </p>
      <button
        onClick={onRefresh}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Yenile
      </button>
    </div>
  );
}
