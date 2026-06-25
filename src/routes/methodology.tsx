import { createFileRoute } from "@tanstack/react-router";
import { Database, GitBranch, Microscope, ShieldAlert, Sigma } from "lucide-react";

import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Yöntem — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "BIST Sinyal Araştırma Lab'ın günlük verileri nasıl topladığı, büyük hareket olaylarını nasıl tanımladığı, hareket öncesi göstergeleri nasıl kaydettiği ve kalıp istatistiklerini nasıl oluşturduğu.",
      },
      { property: "og:title", content: "Yöntem — BIST Sinyal Araştırma Lab" },
      {
        property: "og:description",
        content: "Araştırma süreci: veri topla, olayları işaretle, geriye bak ve tekrarlayan koşulları ölç.",
      },
    ],
  }),
  component: MethodologyPage,
});

const METRICS = [
  "Hisse kodu ve şirket adı",
  "Kapanış fiyatı ve günlük getiri %",
  "Hacim",
  "20 günlük ortalamaya göre hacim oranı",
  "Önceki 2 güne göre hacim oranı",
  "Önceki 3 güne göre hacim oranı",
  "5 / 10 / 20 / 30 günlük getiriler",
  "Piyasa değeri",
  "Günlük işlem hacmi",
  "Sektör",
  "KAP bildirim sayısı",
  "Son KAP tarihi",
];

const STEPS = [
  {
    icon: Database,
    title: "1 · Günlük veri topla",
    body: "Her işlem gününde tüm BIST hisselerinin verisi saklanır — fiyat, getiri, hacim oranları, çok günlük getiriler, piyasa değeri, işlem hacmi, sektör ve KAP bildirim aktivitesi.",
  },
  {
    icon: GitBranch,
    title: "2 · Olayları işaretle",
    body: "Bir hisse +%10, +%15 veya +%20 kazandığında ya da BIST tavan sınırına ulaştığında (tek seansta ~+%10) o gün olay olarak işaretlenir.",
  },
  {
    icon: Microscope,
    title: "3 · Geriye bak",
    body: "Her olay için lab, hisseye ait tüm gösterge setini hareketten 1, 2, 3, 5 ve 10 işlem günü önce kaydeder — öncesinde var olan koşulları.",
  },
  {
    icon: Sigma,
    title: "4 · Kalıpları ölç",
    body: "Tüm olaylar genelinde dağılımlar oluşturur: büyük hareketlerden önce en sık görülen hacim oranları, 5 ve 10 günlük getiriler, KAP aktivitesi ve sektörler.",
  },
];

function MethodologyPage() {
  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold text-foreground">Methodology</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The objective is to discover the highest-probability setup that appears before a stock makes
        a large move — by studying what happened beforehand, not by predicting the future.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.title} className="rounded-xl border border-border bg-card p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <s.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-display text-base font-semibold text-foreground">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-base font-semibold text-foreground">Metrics stored daily</h2>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {METRICS.map((m) => (
              <li key={m} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {m}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h2 className="mt-3 font-display text-base font-semibold text-foreground">
            What this lab does not do
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            It does <span className="font-semibold text-foreground">not</span> generate buy or sell
            signals, recommend trades, or predict which stock will move next. It only collects data,
            detects events that already happened, and reports the conditions that recurred before
            them. Sample data shown is synthetic for demonstration; connect a live BIST feed to
            research real market behaviour.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
