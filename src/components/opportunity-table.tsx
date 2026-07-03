import { Link } from "@tanstack/react-router";
import {
  MACD_STATUS_LABELS,
  scoreTier,
  stabilityTier,
  expectation,
  probabilityNote,
  type MacdStatus,
} from "@/lib/indicators";
import type { OpportunityRow } from "@/lib/opportunities";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ScoreBadge({ score }: { score: number }) {
  const t = scoreTier(score);
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1 rounded-md border px-2 font-mono text-sm font-bold tabular",
        t.bg,
        t.border,
        t.text,
      )}
      title={t.label}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {score}
    </span>
  );
}

export function StabilityBadge({ score }: { score: number }) {
  const t = stabilityTier(score);
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1 rounded-md border px-2 font-mono text-sm font-semibold tabular",
        t.bg,
        t.border,
        t.text,
      )}
      title={`Kararlılık: ${t.label} — aşırı uzamış/aşırı alım kurulumları düşük puan alır`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {score}
    </span>
  );
}



function MacdPill({ status }: { status: MacdStatus }) {
  const cls =
    status === "bullish"
      ? "text-success"
      : status === "bearish"
        ? "text-destructive"
        : "text-muted-foreground";
  return <span className={cn("font-medium", cls)}>{MACD_STATUS_LABELS[status]}</span>;
}

function rsiClass(rsi: number | null): string {
  if (rsi === null) return "text-muted-foreground";
  if (rsi >= 70) return "text-destructive";
  if (rsi <= 30) return "text-success";
  return "text-foreground";
}

export function OpportunityTable({ rows }: { rows: OpportunityRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[1000px] text-sm">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">AI Skoru</th>
            <th className="px-3 py-2.5 font-medium">Kararlılık</th>
            <th className="px-3 py-2.5 font-medium">Hisse</th>
            <th className="px-3 py-2.5 text-right font-medium">Güven</th>
            <th className="px-3 py-2.5 font-medium">Beklenen</th>
            <th className="px-3 py-2.5 text-right font-medium">Kalıp</th>
            <th className="px-3 py-2.5 text-right font-medium">Kapanış</th>
            <th className="px-3 py-2.5 text-right font-medium">Günlük</th>
            <th className="px-3 py-2.5 text-right font-medium">5g Δ</th>
            <th className="px-3 py-2.5 text-right font-medium">Hacim Δ</th>
            <th className="px-3 py-2.5 text-right font-medium">RSI</th>
            <th className="px-3 py-2.5 font-medium">MACD</th>
            <th className="px-3 py-2.5 font-medium">Sektör</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={r.symbol}
              className={cn(
                "transition-colors hover:bg-secondary/40",
                idx % 2 ? "bg-card" : "bg-secondary/20",
              )}
            >
              <td className="px-3 py-2.5">
                <ScoreBadge score={r.aiScore} />
              </td>
              <td className="px-3 py-2.5">
                <StabilityBadge score={r.stability} />
              </td>
              <td className="px-3 py-2.5">
                <Link
                  to="/hisse/$symbol"
                  params={{ symbol: r.symbol }}
                  className="font-mono font-semibold text-foreground hover:text-primary"
                >
                  {r.symbol}
                </Link>
                <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                  {r.company_name ?? "—"}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular">
                {r.confidence === null ? "—" : `%${r.confidence.toFixed(0)}`}
              </td>
              <td className="px-3 py-2.5">
                {(() => {
                  const e = expectation(r.aiScore);
                  const note = probabilityNote(r.probability);
                  return (
                    <div className="leading-tight">
                      <span className={cn("font-medium", e.text)}>{e.label}</span>
                      {note ? (
                        <span className="block text-xs text-muted-foreground">{note}</span>
                      ) : null}
                    </div>
                  );
                })()}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular">
                {r.matchedPatterns > 0 ? (
                  <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                    {r.matchedPatterns}
                  </span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground tabular">
                {r.close === null ? "—" : `₺${r.close.toFixed(2)}`}
              </td>
              <td
                className={cn(
                  "px-3 py-2.5 text-right font-mono tabular",
                  (r.dailyReturn ?? 0) > 0
                    ? "text-success"
                    : (r.dailyReturn ?? 0) < 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                )}
              >
                {fmtPct(r.dailyReturn)}
              </td>
              <td
                className={cn(
                  "px-3 py-2.5 text-right font-mono tabular",
                  (r.ret5d ?? 0) >= 25
                    ? "text-warning"
                    : (r.ret5d ?? 0) > 0
                      ? "text-success"
                      : (r.ret5d ?? 0) < 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                )}
                title={(r.ret5d ?? 0) >= 25 ? "Son 5 seansta aşırı yükseldi — geri çekilme riski" : undefined}
              >
                {fmtPct(r.ret5d)}
              </td>
              <td
                className={cn(
                  "px-3 py-2.5 text-right font-mono tabular",
                  (r.volumeIncrease ?? 0) > 0 ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {fmtPct(r.volumeIncrease, 0)}
              </td>
              <td className={cn("px-3 py-2.5 text-right font-mono tabular", rsiClass(r.rsi))}>
                {r.rsi === null ? "—" : r.rsi.toFixed(0)}
              </td>
              <td className="px-3 py-2.5">
                <MacdPill status={r.macdStatus} />
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                <span className="block max-w-[140px] truncate">{r.sector ?? "—"}</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                Bu filtrelerle eşleşen hisse bulunamadı.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export { fmtMoney, fmtNum };
