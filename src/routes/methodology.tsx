import { createFileRoute } from "@tanstack/react-router";
import { Activity, Database, GitBranch, Layers, Microscope, ShieldAlert, Sigma } from "lucide-react";

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
    body: "BIST'te bir hisse tek seansta en fazla ±%10 hareket edebilir; bu yüzden +%10, doğrudan tavan gününü ifade eder. +%15 ve +%20 ise tek günde değil, birkaç işlem günü boyunca biriken toplam yükseliş olarak işaretlenir.",
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

// Enrichment layer applied on top of the frozen v1.0 engine to favour durable
// setups over exhausted momentum spikes.
const STABILITY_SIGNALS = [
  {
    title: "Kararlılık skoru (0–100)",
    body: "Aşırı alım (yüksek RSI), kısa vadede aşırı yükselmiş (5 günde büyük birikimli getiri) ve oynaklığı yüksek kurulumlar puan kaybeder. Liste, ham AI sinyalinin %60'ı ile kararlılığın %40'ı harmanlanarak sıralanır.",
  },
  {
    title: "Göreli güç (piyasaya göre)",
    body: "Hissenin son ~20 seansta BIST ortalamasına göre ne kadar öne çıktığı ölçülür. Piyasayla birlikte yükselen değil, piyasayı geride bırakan liderler daha kararlı kabul edilir.",
  },
  {
    title: "Hacim onayı (OBV)",
    body: "Yükseliş artan hacimle geliyorsa (gerçek birikim) puan eklenir; yükseliş azalan/zayıf hacimle sürüyorsa (dağıtım / tükenme riski) puan düşülür.",
  },
  {
    title: "Likidite (işlem hacmi)",
    body: "Günlük işlem hacmi düşük, manipülasyona açık ve çıkışı zor 'sığ' hisseler otomatik olarak geri plana atılır ve varsayılan filtrede elenir.",
  },
];

function MethodologyPage() {
  return (
    <AppShell>
      <h1 className="font-display text-2xl font-bold text-foreground">Yöntem</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Amaç, bir hisse büyük bir hareket yapmadan önce ortaya çıkan en yüksek olasılıklı kurulumu
        keşfetmektir — geleceği tahmin ederek değil, öncesinde ne olduğunu inceleyerek.
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
          <h2 className="font-display text-base font-semibold text-foreground">Günlük saklanan veriler</h2>
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
            Bu lab neleri yapmaz
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Al veya sat sinyali <span className="font-semibold text-foreground">üretmez</span>, işlem
            önermez veya hangi hissenin hareket edeceğini tahmin etmez. Yalnızca veri toplar, halihazırda
            gerçekleşmiş olayları tespit eder ve bunlardan önce tekrarlayan koşulları raporlar. Yalnızca
            araştırma amaçlıdır, yatırım tavsiyesi değildir.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
