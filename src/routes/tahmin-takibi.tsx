import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingDown,
  Activity,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import {
  predictionReviewQueryOptions,
  MISS_REASON_DESC,
  type PredictionOutcome,
  type OutcomeStatus,
} from "@/lib/prediction-review";
import { fmtNum, fmtPct, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tahmin-takibi")({
  head: () => ({
    meta: [
      { title: "Tahmin Takibi — BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "Günlük öneri listesinin tahminleri tuttu mu? Hedefe ulaşan ve ulaşamayan hisseler, isabet oranları ve hedefe ulaşamama nedenlerinin analizi. Yalnızca araştırma amaçlıdır.",
      },
      { property: "og:title", content: "Tahmin Takibi — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Günlük önerilerin gerçekleşen sonuçları: isabet oranı ve hedefe ulaşamama nedenlerinin analizi.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(predictionReviewQueryOptions()),
  component: PredictionReviewPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Tahmin takibi yüklenemedi</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Tahmin takibi verisi bulunamadı.</p>
    </AppShell>
  ),
});

function PredictionReviewPage() {
  const { data } = useSuspenseQuery(predictionReviewQueryOptions());

  return (
    <AppShell>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Target className="h-3.5 w-3.5" /> Gerçekleşen Sonuçlar
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Günlük öneriler <span className="text-primary">hedefe ulaştı mı?</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Her günkü öneri listesindeki her hissenin hedefi (tavan, +%10, +%15, +%20) belirlenen süre
            içinde gerçek fiyat hareketiyle karşılaştırılır. Hedefe ulaşanlar{" "}
            <span className="font-medium text-success">isabet</span>, süresi dolup ulaşamayanlar{" "}
            <span className="font-medium text-destructive">ıska</span> sayılır. Aşağıda ıskaların neden
            hedefe ulaşamadığını da analiz ediyoruz. Yalnızca araştırma amaçlıdır — yatırım tavsiyesi değildir.
          </p>
          {data.firstDate && (
            <p className="mt-3 text-xs text-muted-foreground">
              Değerlendirme aralığı:{" "}
              <span className="font-medium text-foreground">{fmtDateShort(data.firstDate)}</span> –{" "}
              <span className="font-medium text-foreground">{fmtDateShort(data.lastScoreDate)}</span>{" "}
              · Fiyat verisi: {fmtDateShort(data.lastSnapshotDate)}
            </p>
          )}
        </div>
      </section>

      {/* Summary tiles */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          icon={<Activity className="h-4 w-4" />}
          label="Sonuçlanan tahmin"
          value={fmtNum(data.settled)}
          sub={`${fmtNum(data.pending)} beklemede`}
          tone="neutral"
        />
        <SummaryTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Hedefe ulaşan"
          value={fmtNum(data.hits)}
          tone="success"
        />
        <SummaryTile
          icon={<XCircle className="h-4 w-4" />}
          label="Ulaşamayan"
          value={fmtNum(data.misses)}
          tone="danger"
        />
        <SummaryTile
          icon={<Target className="h-4 w-4" />}
          label="İsabet oranı"
          value={data.hitRate == null ? "—" : `${data.hitRate.toFixed(1)}%`}
          tone={data.hitRate != null && data.hitRate >= 30 ? "success" : "neutral"}
        />
      </section>

      {data.settled === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Henüz hedef süresi dolan tahmin yok. Öneriler yeterli işlem günü geçtikçe burada sonuçlanacak.
        </div>
      ) : (
        <>
          {/* By target */}
          <section className="mt-10">
            <h2 className="font-display text-xl font-bold text-foreground">Hedef türüne göre isabet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Her hedef, kendi süresi ve eşiği ile değerlendirilir.
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Hedef</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sonuçlanan</th>
                    <th className="px-3 py-2.5 text-right font-medium">İsabet</th>
                    <th className="px-3 py-2.5 text-right font-medium">İsabet oranı</th>
                    <th className="px-3 py-2.5 text-right font-medium">Beklemede</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ort. tahmin olasılığı</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTarget.map((t, idx) => (
                    <tr key={t.target} className={idx % 2 === 1 ? "bg-card" : "bg-secondary/20"}>
                      <td className="px-3 py-2.5 font-medium text-foreground">{t.label}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                        {fmtNum(t.settled)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                        {fmtNum(t.hits)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-mono font-semibold tabular",
                          t.hitRate == null
                            ? "text-muted-foreground"
                            : t.hitRate >= 30
                              ? "text-success"
                              : "text-foreground",
                        )}
                      >
                        {t.hitRate == null ? "—" : `${t.hitRate.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                        {fmtNum(t.pending)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                        {t.avgProb == null ? "—" : `${t.avgProb.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Failure analysis */}
          {data.reasons.length > 0 && (
            <section className="mt-10">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                <h2 className="font-display text-xl font-bold text-foreground">
                  Hedefe neden ulaşamadılar?
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Süresi dolup hedefe ulaşamayan {fmtNum(data.misses)} tahmin, fiyat ve piyasa davranışına
                göre kategorilere ayrıldı.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.reasons.map((r) => (
                  <div key={r.reason} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{r.label}</span>
                      <span className="font-mono text-sm text-muted-foreground tabular">
                        {fmtNum(r.count)} · {r.share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-destructive/70"
                        style={{ width: `${Math.max(3, r.share)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {MISS_REASON_DESC[r.reason]}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Worst misses */}
          {data.worstMisses.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl font-bold text-foreground">
                En çok geri çekilen ıskalar
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hedefe ulaşamayan ve pencere sonunda en fazla değer kaybeden öneriler.
              </p>
              <OutcomeTable rows={data.worstMisses} showReason />
            </section>
          )}

          {/* Best hits */}
          {data.bestHits.length > 0 && (
            <section className="mt-10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <h2 className="font-display text-xl font-bold text-foreground">
                  Hedefe en hızlı ulaşan tahminler
                </h2>
              </div>
              <OutcomeTable rows={data.bestHits} />
            </section>
          )}
        </>
      )}

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        Not: Hedef, öneri gününün kapanış fiyatı baz alınarak takip eden işlem günlerinde ölçülür.
        Tavan hedefi tek seans +%10 hareket, diğerleri belirtilen gün içindeki birikimli yükseliş
        olarak değerlendirilir.
      </p>
    </AppShell>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "neutral" | "success" | "danger";
}) {
  const toneCls =
    tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={toneCls}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-2 font-display text-2xl font-bold tabular", toneCls)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const STATUS_META: Record<OutcomeStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  hit: {
    label: "Ulaştı",
    cls: "border-success/40 bg-success/10 text-success",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  miss: {
    label: "Iska",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: <XCircle className="h-3 w-3" />,
  },
  pending: {
    label: "Beklemede",
    cls: "border-border bg-secondary/40 text-muted-foreground",
    icon: <Clock className="h-3 w-3" />,
  },
};

function OutcomeTable({ rows, showReason }: { rows: PredictionOutcome[]; showReason?: boolean }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Hisse</th>
            <th className="px-3 py-2.5 font-medium">Öneri günü</th>
            <th className="px-3 py-2.5 font-medium">Hedef</th>
            <th className="px-3 py-2.5 text-right font-medium">En yüksek</th>
            <th className="px-3 py-2.5 text-right font-medium">Sonuç</th>
            <th className="px-3 py-2.5 font-medium">Durum</th>
            {showReason && <th className="px-3 py-2.5 font-medium">Neden</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const meta = STATUS_META[r.status];
            return (
              <tr key={`${r.symbol}-${r.score_date}`} className={idx % 2 === 1 ? "bg-card" : "bg-secondary/20"}>
                <td className="px-3 py-2.5">
                  <Link
                    to="/hisse/$symbol"
                    params={{ symbol: r.symbol }}
                    className="font-mono font-semibold text-foreground hover:text-primary"
                  >
                    {r.symbol}
                  </Link>
                  {r.company_name && (
                    <div className="max-w-[10rem] truncate text-xs text-muted-foreground">
                      {r.company_name}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDateShort(r.score_date)}</td>
                <td className="px-3 py-2.5 text-xs text-foreground">{r.targetLabel}</td>
                <td className="px-3 py-2.5 text-right font-mono text-success tabular">
                  {fmtPct(r.maxRet)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right font-mono font-semibold tabular",
                    r.finalRet >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {fmtPct(r.finalRet)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                      meta.cls,
                    )}
                  >
                    {meta.icon}
                    {meta.label}
                    {r.status === "hit" && r.daysToHit ? ` · ${r.daysToHit}g` : ""}
                  </span>
                </td>
                {showReason && (
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {r.reason ? MISS_REASON_DESC_SHORT(r) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MISS_REASON_DESC_SHORT(r: PredictionOutcome): string {
  const labels: Record<string, string> = {
    market: "Piyasa zayıftı",
    decline: "Sert düşüş",
    faded: "Momentum söndü",
    close: "Hedefe yaklaştı",
    flat: "Yatay seyretti",
  };
  return r.reason ? labels[r.reason] ?? "—" : "—";
}
