import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, TrendingUp, BarChart3 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ScoreBadge } from "@/components/opportunity-table";
import { LineChart, BarChart } from "@/components/mini-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { stockDetailQueryOptions, type StockDetailData } from "@/lib/opportunities";
import {
  atr,
  atrTrue,
  beta as calcBeta,
  bollinger,
  expectation,
  macd,
  MACD_STATUS_LABELS,
  probabilityNote,
  rsi,
  scoreTier,
  sma,
  supportResistance,
  targetLabel,
  volatility,
} from "@/lib/indicators";
import { useMarketOpen, REFRESH_MS } from "@/hooks/use-market-open";
import { fmtDate, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hisse/$symbol")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.symbol} — Hisse Analizi · BIST Sinyal Araştırma Lab` },
      {
        name: "description",
        content: `${params.symbol} için AI skoru, eşleşen kalıplar, RSI, MACD, Bollinger, hareketli ortalamalar, ATR, volatilite, beta ve destek/direnç analizi. Yalnızca araştırma amaçlıdır.`,
      },
    ],
  }),
  component: DetailPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Hisse verisi yüklenemedi</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Hisse bulunamadı.</p>
    </AppShell>
  ),
});

function DetailPage() {
  const { symbol } = Route.useParams();
  const router = useRouter();
  const marketOpen = useMarketOpen();
  const { data, isPending } = useQuery({
    ...stockDetailQueryOptions(symbol),
    refetchInterval: marketOpen ? REFRESH_MS : false,
  });

  if (isPending) {
    return (
      <AppShell>
        <Skeleton className="h-32 w-full" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!data || data.history.closes.length === 0) {
    return (
      <AppShell>
        <BackLink />
        <div className="mt-6 rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
          {symbol.toUpperCase()} için yeterli geçmiş veri bulunamadı.
        </div>
      </AppShell>
    );
  }

  const closes = data.history.closes;
  const volumes = data.history.volumes;
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? last;
  const dailyReturn = data.recentRets[data.recentRets.length - 1] ?? ((last - prev) / prev) * 100;
  const last30 = closes.slice(-30);
  const vol30 = volumes.slice(-30);
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.max(1, volumes.slice(-20).length);
  const volInc = avgVol20 ? (volumes[volumes.length - 1] / avgVol20 - 1) * 100 : null;

  const rsiVal = rsi(closes);
  const macdRes = macd(closes);
  const bb = bollinger(closes);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const atrRealVal = atrTrue(data.history.highs, data.history.lows, closes);
  const atrVal = atrRealVal ?? atr(closes);
  const atrIsTrue = atrRealVal !== null;
  const vol = volatility(data.recentRets.slice(-30));
  const betaVal = calcBeta(data.recentRets, data.marketRet);
  const sr = supportResistance(closes, last);

  const tier = scoreTier(data.aiScore);
  const wl = data.watchlist;
  const commentary = buildCommentary(data, { rsiVal, macdStatus: macdRes.status, vol, volInc, tier });

  return (
    <AppShell>
      <BackLink />

      {/* Header */}
      <section className={cn("mt-4 overflow-hidden rounded-2xl border bg-card", tier.border)}>
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">{data.symbol}</h1>
              <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", tier.bg, tier.border, tier.text)}>
                {tier.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{data.company_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{data.sector ?? "—"}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Son kapanış</div>
              <div className="font-mono text-2xl font-semibold text-foreground tabular">₺{last.toFixed(2)}</div>
              <div
                className={cn(
                  "font-mono text-sm tabular",
                  dailyReturn > 0 ? "text-success" : dailyReturn < 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {fmtPct(dailyReturn)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">AI Skoru</div>
              <div className="mt-1">
                <ScoreBadge score={data.aiScore} />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          <HeaderStat label="Güven Skoru" value={wl?.confidence != null ? `%${wl.confidence.toFixed(0)}` : "—"} />
          <HeaderStat
            label="Beklenti"
            value={expectation(data.aiScore).label}
            sub={probabilityNote(wl?.probability) ?? undefined}
          />
          <HeaderStat label="Eşleşen Kalıp" value={(wl?.matched_patterns ?? 0).toString()} />
          <HeaderStat
            label="Geçmiş Başarı"
            value={wl?.hist_success_pct != null ? `%${wl.hist_success_pct.toFixed(1)}` : "—"}
          />
        </div>
      </section>

      {/* AI commentary */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold text-foreground">AI yorumu — neden bu skor?</h2>
        </div>
        <ul className="mt-3 space-y-2">
          {commentary.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {c}
            </li>
          ))}
        </ul>
      </section>

      {/* Technicals */}
      <section className="mt-6">
        <h2 className="font-display text-sm font-semibold text-foreground">Teknik göstergeler</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="RSI (14)" value={rsiVal === null ? "—" : rsiVal.toFixed(1)} hint={rsiHint(rsiVal)} />
          <Metric label="MACD" value={MACD_STATUS_LABELS[macdRes.status]} hint={macdRes.hist != null ? `Histogram ${macdRes.hist.toFixed(2)}` : undefined} />
          <Metric label="Bollinger %B" value={bb.pctB === null ? "—" : `%${bb.pctB.toFixed(0)}`} hint={bb.upper ? `Üst ₺${bb.upper.toFixed(2)} · Alt ₺${bb.lower!.toFixed(2)}` : undefined} />
          <Metric label="Volatilite (yıllık)" value={vol === null ? "—" : `%${vol.toFixed(0)}`} />
          <Metric label="MA 20" value={ma20 === null ? "—" : `₺${ma20.toFixed(2)}`} hint={ma20 && last > ma20 ? "Fiyat üzerinde" : "Fiyat altında"} />
          <Metric label="MA 50" value={ma50 === null ? "—" : `₺${ma50.toFixed(2)}`} hint={ma50 && last > ma50 ? "Fiyat üzerinde" : "Fiyat altında"} />
          <Metric label="MA 200" value={ma200 === null ? "—" : `₺${ma200.toFixed(2)}`} hint={ma200 && last > ma200 ? "Fiyat üzerinde" : "Fiyat altında"} />
          <Metric label={atrIsTrue ? "ATR (14, gerçek)" : "ATR (14, kapanış)"} value={atrVal === null ? "—" : `₺${atrVal.toFixed(2)}`} hint={atrIsTrue ? "Gün içi yüksek/düşük" : "Yaklaşık"} />
          <Metric label="Beta" value={betaVal === null ? "—" : betaVal.toFixed(2)} hint="Piyasaya göre" />
          <Metric
            label="Destek"
            value={sr.support.length ? sr.support.map((s) => `₺${s.toFixed(2)}`).join(" · ") : "—"}
          />
          <Metric
            label="Direnç"
            value={sr.resistance.length ? sr.resistance.map((s) => `₺${s.toFixed(2)}`).join(" · ") : "—"}
          />
          <Metric label="Hacim Artışı" value={volInc === null ? "—" : fmtPct(volInc, 0)} hint="20g ortalamaya göre" />
        </div>
      </section>

      {/* Charts */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Son 30 gün — fiyat</h3>
          </div>
          <div className="mt-4">
            <LineChart values={last30} color="var(--primary)" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            <h3 className="font-display text-sm font-semibold text-foreground">Son 30 gün — hacim</h3>
          </div>
          <div className="mt-4">
            <BarChart values={vol30} color="var(--accent)" />
          </div>
        </div>
      </section>

      {/* Matched patterns */}
      <section className="mt-6">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Eşleşen kalıplar {data.patterns.length > 0 ? `(${data.patterns.length})` : ""}
        </h2>
        {data.patterns.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Bu hisse için son puanlama gününde doğrulanmış kalıp eşleşmesi bulunmuyor.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Kalıp</th>
                  <th className="px-3 py-2.5 font-medium">Hedef</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ufuk</th>
                  <th className="px-3 py-2.5 text-right font-medium">Başarı</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lift</th>
                  <th className="px-3 py-2.5 text-right font-medium">Görülme</th>
                </tr>
              </thead>
              <tbody>
                {data.patterns.map((p, i) => (
                  <tr key={p.label + i} className={i % 2 ? "bg-card" : "bg-secondary/20"}>
                    <td className="px-3 py-2.5 text-foreground">{p.label}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{targetLabel(p.target_key)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">{p.horizon}g</td>
                    <td className="px-3 py-2.5 text-right font-mono text-primary tabular">
                      {p.precision_pct === null ? "—" : `%${p.precision_pct.toFixed(1)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                      {p.lift === null ? "—" : `${p.lift.toFixed(2)}×`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                      {p.occurrences ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        Teknik göstergeler kapanış fiyatları üzerinden hesaplanır{atrIsTrue ? "; ATR gerçek gün içi yüksek/düşük verisiyle hesaplanır" : " (ATR yaklaşıktır)"}. Son veri tarihi:{" "}
        {fmtDate(data.latestDate)}. Yalnızca araştırma amaçlıdır — yatırım tavsiyesi değildir.
      </p>
    </AppShell>
  );
}

function BackLink() {
  return (
    <Link
      to="/firsatlar"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Fırsat listesine dön
    </Link>
  );
}

function HeaderStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold text-foreground tabular">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-foreground tabular">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function rsiHint(rsi: number | null): string | undefined {
  if (rsi === null) return undefined;
  if (rsi >= 70) return "Aşırı alım";
  if (rsi <= 30) return "Aşırı satım";
  return "Nötr bölge";
}

function buildCommentary(
  data: StockDetailData,
  ind: { rsiVal: number | null; macdStatus: string; vol: number | null; volInc: number | null; tier: { label: string } },
): string[] {
  const out: string[] = [];
  const wl = data.watchlist;
  out.push(
    `AI skoru ${data.aiScore}/100 (${ind.tier.label}). Skor; günlük olasılık, eşleşen kalıp sayısı, güven ve geçmiş başarı oranının ağırlıklı birleşimidir.`,
  );
  if ((wl?.matched_patterns ?? 0) > 0) {
    out.push(
      `${wl!.matched_patterns} doğrulanmış kalıpla eşleşiyor; istatistiksel beklenti: ${expectation(data.aiScore).label} (geçmiş başarı %${(wl?.hist_success_pct ?? 0).toFixed(1)}). Bu bir fiyat hedefi değil, olasılık okumasıdır.`,
    );
  } else {
    out.push("Son puanlama gününde doğrulanmış kalıp eşleşmesi yok; skor koşulsuz taban olasılığa yakın.");
  }
  if (ind.volInc != null && ind.volInc > 25) {
    out.push(`Hacim 20 günlük ortalamanın %${ind.volInc.toFixed(0)} üzerinde — büyük hareket öncesi sık görülen koşul.`);
  }
  if (ind.rsiVal != null) {
    if (ind.rsiVal >= 70) out.push(`RSI ${ind.rsiVal.toFixed(0)} ile aşırı alım bölgesinde — momentum güçlü ancak geri çekilme riski var.`);
    else if (ind.rsiVal <= 30) out.push(`RSI ${ind.rsiVal.toFixed(0)} ile aşırı satım bölgesinde — toparlanma potansiyeli.`);
    else out.push(`RSI ${ind.rsiVal.toFixed(0)} ile nötr momentum bölgesinde.`);
  }
  out.push(`MACD durumu ${MACD_STATUS_LABELS[ind.macdStatus as keyof typeof MACD_STATUS_LABELS] ?? ind.macdStatus}.`);
  if (ind.vol != null && ind.vol > 60) {
    out.push(`Yıllık volatilite %${ind.vol.toFixed(0)} — yüksek oynaklık, büyük hareketlerin geçmişte sık görüldüğü profil.`);
  }
  return out;
}
