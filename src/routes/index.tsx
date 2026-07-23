import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { BuyList } from "@/components/buy-list";
import { PortfolioPanel } from "@/components/portfolio-panel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bu Hafta Al — BIST Sinyal Lab" },
      {
        name: "description",
        content:
          "Yaklaşan hafta içinde %10-20 yükseliş potansiyeli olan BIST hisseleri. Sistem her gece kendini değerlendirip parametrelerini otomatik günceller.",
      },
      { property: "og:title", content: "Bu Hafta Al — BIST Sinyal Lab" },
      {
        property: "og:description",
        content: "Haftalık %10-20 hedefli otomatik BIST öneri listesi ve portföy takibi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Bu hafta <span className="text-primary">%10-20</span> yükselecek hisseleri önceden yakala
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Sistem her gece dünkü önerilerin ne kadar tuttuğuna bakar ve eşikleri kendi ayarlar. Sen sadece "Aldım" de.
          </p>
        </div>
      </section>

      <BuyList />
      <PortfolioPanel />
    </AppShell>
  );
}
