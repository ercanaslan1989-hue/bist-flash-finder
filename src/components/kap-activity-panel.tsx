import { Megaphone, Info } from "lucide-react";

import type { FeatureRow } from "@/lib/research";
import { kapActivityByWindow, kapAnyRunupPct, hasKapData } from "@/lib/analysis";
import { cn } from "@/lib/utils";

/**
 * Pre-event KAP activity panel for the 🔥 Event Analysis dashboard.
 * Shows, per lookback window (1/2/3/5/10 days before a big move), how often a
 * KAP disclosure preceded the event. Populates automatically once KAP
 * disclosure counts are ingested into event_features.kap_count.
 */
export function KapActivityPanel({ features }: { features: FeatureRow[] }) {
  const stats = kapActivityByWindow(features);
  const anyRunup = kapAnyRunupPct(features);
  const populated = hasKapData(features);
  const maxPct = Math.max(1, ...stats.map((s) => s.withKapPct));

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-chart-4" />
        <h2 className="font-display text-xl font-bold text-foreground">
          Olay öncesi KAP aktivitesi
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Büyük hareketten önceki her pencerede (1–10 işlem günü) bir KAP bildiriminin
        ne sıklıkta ortaya çıktığı. Yatırım tavsiyesi değildir.
      </p>

      {!populated ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">KAP bildirim verisi henüz bağlı değil.</span>{" "}
            Hesap katmanı hazır — kaynak beslendiği anda ({" "}
            <span className="font-mono">event_features.kap_count</span>) aşağıdaki
            pencere istatistikleri otomatik olarak dolacaktır.
          </div>
        </div>
      ) : (
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-chart-4/40 bg-chart-4/10 px-3 py-1 text-xs font-medium text-foreground">
          <Megaphone className="h-3.5 w-3.5 text-chart-4" />
          Olayların{" "}
          <span className="font-mono font-semibold text-chart-4">{anyRunup.toFixed(0)}%</span>'inde
          hareketten önceki 10 günde en az bir KAP bildirimi vardı
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Pencere</th>
              <th className="px-3 py-2 font-medium">Bildirim görülen olaylar</th>
              <th className="px-3 py-2 text-right font-medium">Pay</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Ort. adet</th>
              <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">2+ bildirim</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, idx) => (
              <tr key={s.daysBefore} className={idx % 2 ? "bg-card" : "bg-secondary/20"}>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">{s.label}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full bg-chart-4 transition-all")}
                        style={{ width: `${(s.withKapPct / maxPct) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground tabular">
                      {s.withKap}/{s.events}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-foreground tabular">
                  {s.withKapPct.toFixed(1)}%
                </td>
                <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground tabular sm:table-cell">
                  {s.avgCount.toFixed(2)}
                </td>
                <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground tabular sm:table-cell">
                  {s.multiPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
