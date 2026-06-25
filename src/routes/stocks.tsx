import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Layers, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { latestSnapshotsQueryOptions } from "@/lib/research";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stocks")({
  head: () => ({
    meta: [
      { title: "Hisse Evreni — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "Takip edilen her BIST hissesi için en güncel günlük veri: kapanış, günlük getiri, hacim oranları, çok günlük getiriler, piyasa değeri, işlem hacmi ve KAP aktivitesi.",
      },
      { property: "og:title", content: "Hisse Evreni — BIST Sinyal Araştırma Lab" },
      {
        property: "og:description",
        content: "Takip edilen BIST evreni için en güncel günlük metrikler.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(latestSnapshotsQueryOptions()),
  component: StocksPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-6">
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Hisse bulunamadı.</p>
    </AppShell>
  ),
});

function StocksPage() {
  const { data } = useSuspenseQuery(latestSnapshotsQueryOptions());
  const [q, setQ] = useState("");

  const rows = data.filter((r) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      r.symbol.toLowerCase().includes(needle) ||
      (r.stocks?.company_name ?? "").toLowerCase().includes(needle) ||
      (r.stocks?.sector ?? "").toLowerCase().includes(needle)
    );
  });

  const asOf = data[0]?.snapshot_date;

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-accent" />
            <h1 className="font-display text-2xl font-bold text-foreground">Hisse evreni</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {fmtNum(data.length)} hisse için en güncel veri · {fmtDate(asOf)} itibarıyla
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hisse kodu, ad veya sektör ara…"
            className="w-64 rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Hisse</th>
              <th className="px-3 py-2.5 font-medium">Sektör</th>
              <th className="px-3 py-2.5 text-right font-medium">Kapanış</th>
              <th className="px-3 py-2.5 text-right font-medium">Günlük</th>
              <th className="px-3 py-2.5 text-right font-medium">Hac ×20g</th>
              <th className="px-3 py-2.5 text-right font-medium">5g</th>
              <th className="px-3 py-2.5 text-right font-medium">20g</th>
              <th className="px-3 py-2.5 text-right font-medium">Piyasa değeri</th>
              <th className="px-3 py-2.5 text-right font-medium">İşlem hacmi</th>
              <th className="px-3 py-2.5 text-right font-medium">KAP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.symbol} className={cn("border-t border-border/60", idx % 2 && "bg-card")}>
                <td className="px-3 py-2.5">
                  <div className="font-mono font-semibold text-foreground">{r.symbol}</div>
                  <div className="text-xs text-muted-foreground">{r.stocks?.company_name}</div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.stocks?.sector}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                  {fmtNum(r.close, 2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular">
                  <span className={signClass(r.daily_return_pct)}>{fmtPct(r.daily_return_pct)}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular">
                  <span className={(r.vol_ratio_20d ?? 0) >= 1.5 ? "text-primary" : "text-foreground"}>
                    {fmtRatio(r.vol_ratio_20d)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular">
                  <span className={signClass(r.ret_5d)}>{fmtPct(r.ret_5d)}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular">
                  <span className={signClass(r.ret_20d)}>{fmtPct(r.ret_20d)}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                  {fmtMoney(r.market_value)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                  {fmtMoney(r.daily_traded_value)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                  {r.kap_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function signClass(v: number | null) {
  if (v === null || v === undefined) return "text-muted-foreground";
  return v > 0 ? "text-success" : v < 0 ? "text-destructive" : "text-foreground";
}
