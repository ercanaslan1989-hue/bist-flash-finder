import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck, SplitSquareHorizontal } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { oosQueryOptions, type OosRow } from "@/lib/research";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/oos")({
  head: () => ({
    meta: [
      { title: "Canlı Doğrulama — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "Her hareket hedefi için eğitim (2025) ile örneklem dışı (2026+) isabet karşılaştırması; v1.0 BIST kalıp motorunun görülmemiş veride aşırı uyum olmadan dayandığını doğrular. Yalnızca araştırma amaçlıdır.",
      },
      { property: "og:title", content: "Canlı Doğrulama — BIST Sinyal Lab" },
      {
        property: "og:description",
        content:
          "Doğrulanmış BIST kalıplarının görülmemiş 2026 verisine genellendiğini gösteren kronolojik eğitim/test ayrımı.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(oosQueryOptions()),
  component: OosPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Canlı doğrulama yüklenemedi
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Canlı doğrulama verisi bulunamadı.</p>
    </AppShell>
  ),
});

const TARGET_LABELS: Record<string, string> = {
  g20: "+%20 yükseliş",
  g15: "+%15",
  g10: "+%10",
  lu: "+%10 tavan",
};

function OosPage() {
  const { data } = useSuspenseQuery(oosQueryOptions());
  const { rows, version } = data;

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <SplitSquareHorizontal className="h-3.5 w-3.5" /> Genelleme Testi
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Canlı <span className="text-primary">doğrulama</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Kalıplar eğitim penceresinde (2025) keşfedilir, ardından görülmemiş örneklem dışı verilerde
            (2026+) yeniden ölçülür. Eğitim ile örneklem dışı isabetin tutarlı olması, kalıpların aşırı
            uyum yerine genellediğini gösterir. Yalnızca araştırma amaçlıdır — al/sat sinyali yoktur.
          </p>
          {version?.frozen && (
            <span className="mt-4 inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <ShieldCheck className="h-3.5 w-3.5" /> Motor {version.version} donduruldu
            </span>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Hedef</th>
                <th className="px-3 py-2.5 font-medium">Eğitim dönemi</th>
                <th className="px-3 py-2.5 font-medium">Test dönemi</th>
                <th className="px-3 py-2.5 text-right font-medium">Eğitim isabeti</th>
                <th className="px-3 py-2.5 text-right font-medium">Canlı isabet</th>
                <th className="px-3 py-2.5 text-right font-medium">Δ</th>
                <th className="px-3 py-2.5 text-right font-medium">Eğitim n</th>
                <th className="px-3 py-2.5 text-right font-medium">Canlı n</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <Row key={r.id} r={r} zebra={idx % 2 === 1} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    No out-of-sample rows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.some((r) => r.note) && (
          <div className="mt-4 grid gap-2 rounded-xl border border-border bg-card p-5">
            {rows
              .filter((r) => r.note)
              .map((r) => (
                <p key={r.id} className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {TARGET_LABELS[r.target_key] ?? r.target_key}:
                  </span>{" "}
                  {r.note}
                </p>
              ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Row({ r, zebra }: { r: OosRow; zebra: boolean }) {
  const delta =
    r.in_sample_precision !== null && r.oos_precision !== null
      ? r.oos_precision - r.in_sample_precision
      : null;
  return (
    <tr className={zebra ? "bg-card" : "bg-secondary/20"}>
      <td className="px-3 py-2.5 font-medium text-foreground">
        {TARGET_LABELS[r.target_key] ?? r.target_key}
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.train_period ?? "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.test_period ?? "—"}</td>
      <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
        {fmtNum(r.in_sample_precision, 1)}%
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground tabular">
        {fmtNum(r.oos_precision, 1)}%
      </td>
      <td
        className={
          "px-3 py-2.5 text-right font-mono tabular " +
          (delta === null
            ? "text-muted-foreground"
            : delta >= -3
              ? "text-success"
              : "text-destructive")
        }
      >
        {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
        {fmtNum(r.in_sample_n)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
        {fmtNum(r.oos_n)}
      </td>
    </tr>
  );
}
