// Model Health dashboard — surfaces regime, drift, calibration + daily audit
// history so the operator can see whether daily recommendations are staying
// aligned with reality.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detectRegime, REGIME_ADVICE, REGIME_LABEL, type Regime } from "@/lib/ml/regime";
import { detectDrift } from "@/lib/ml/drift";

export const Route = createFileRoute("/model-health")({
  head: () => ({
    meta: [
      { title: "Model Sağlığı — BIST Sinyal Lab" },
      { name: "description", content: "Piyasa rejimi, feature drift, kalibrasyon ve günlük isabet oranı takibi." },
    ],
  }),
  component: ModelHealthPage,
});

const sb = supabase as unknown as { from: (t: string) => any };

const REGIME_TONE: Record<Regime, string> = {
  trend_up: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  trend_down: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  sideways: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  risk_off: "bg-red-500/20 text-red-500 border-red-500/40",
};

function ModelHealthPage() {
  const regime = useQuery({ queryKey: ["mh", "regime"], queryFn: () => detectRegime(20), staleTime: 300_000 });
  const drift = useQuery({ queryKey: ["mh", "drift"], queryFn: () => detectDrift(20, 90), staleTime: 300_000 });
  const audit = useQuery({
    queryKey: ["mh", "audit"],
    queryFn: async () => {
      const { data } = await sb
        .from("prediction_audit")
        .select("*")
        .order("audit_date", { ascending: false })
        .limit(30);
      return (data ?? []) as any[];
    },
  });
  const tune = useQuery({
    queryKey: ["mh", "tune"],
    queryFn: async () => {
      const { data } = await sb
        .from("auto_tune_history")
        .select("*")
        .order("tuned_at", { ascending: false })
        .limit(30);
      return (data ?? []) as any[];
    },
  });
  const tuneState = useQuery({
    queryKey: ["mh", "tuneState"],
    queryFn: async () => {
      const { data } = await sb.from("auto_tune_state").select("*").eq("id", 1).maybeSingle();
      return data as any;
    },
  });

  const r = regime.data;
  const d = drift.data;
  const lastAudit = audit.data?.[0];

  return (
    <AppShell>
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Model Sağlığı</h1>
        <p className="text-sm text-muted-foreground">
          Sistemin piyasa rejimini nasıl gördüğü, verilerin ne kadar kayma gösterdiği ve tahminlerimizin
          gerçekle ne kadar örtüştüğü — hepsi tek panelde.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Piyasa Rejimi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {r ? (
              <>
                <Badge className={`w-fit border ${REGIME_TONE[r.regime]}`}>{REGIME_LABEL[r.regime]}</Badge>
                <div className="text-2xl font-bold">{r.regimeScore >= 0 ? "+" : ""}{r.regimeScore}</div>
                <div className="text-xs text-muted-foreground">
                  20g trend {r.trend}% · vol {r.volatility}% · breadth {(r.breadth * 100).toFixed(0)}%
                </div>
                <p className="text-xs text-muted-foreground">{REGIME_ADVICE[r.regime]}</p>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Yükleniyor…</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Feature Drift</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {d ? (
              <>
                <Badge
                  className={`w-fit border ${
                    d.level === "shift"
                      ? "bg-red-500/15 text-red-500 border-red-500/30"
                      : d.level === "warning"
                      ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                  }`}
                >
                  {d.level === "shift" ? "Belirgin kayma" : d.level === "warning" ? "Uyarı" : "Stabil"}
                </Badge>
                <div className="text-2xl font-bold">PSI {d.psi}</div>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {d.features.map((f) => (
                    <li key={f.feature} className="flex justify-between">
                      <span>{f.feature}</span>
                      <span>
                        {f.psi} · {f.baselineMean} → {f.recentMean}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Yükleniyor…</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Son 20g İsabet</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {lastAudit ? (
              <>
                <div className="text-3xl font-bold">
                  {lastAudit.hit_rate != null ? `%${Math.round(lastAudit.hit_rate * 100)}` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lastAudit.hits} tuttu · {lastAudit.misses} kaçtı · {lastAudit.pending} bekliyor
                </div>
                <div className="text-xs text-muted-foreground">
                  Ort. getiri {lastAudit.avg_return != null ? `%${(+lastAudit.avg_return).toFixed(2)}` : "—"} · zirve{" "}
                  {lastAudit.avg_max_return != null ? `%${(+lastAudit.avg_max_return).toFixed(2)}` : "—"}
                </div>
                {Array.isArray(lastAudit.notes?.alerts) && lastAudit.notes.alerts.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-amber-500">
                    {lastAudit.notes.alerts.map((a: string, i: number) => (
                      <li key={i}>⚠︎ {a}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                Henüz denetim kaydı yok. İlk çalışmayı beklerken /api/public/hooks/daily-audit çağrısını
                manuel tetikleyebilirsin.
              </span>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Denetim geçmişi (son 30 gün)</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.data && audit.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left">Tarih</th>
                    <th className="text-right">Tuttu</th>
                    <th className="text-right">Kaçtı</th>
                    <th className="text-right">Bekliyor</th>
                    <th className="text-right">İsabet</th>
                    <th className="text-right">Ort. getiri</th>
                    <th className="text-left pl-3">Rejim</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.map((row) => (
                    <tr key={row.id} className="border-t border-border/40">
                      <td className="py-1">{row.audit_date}</td>
                      <td className="text-right">{row.hits}</td>
                      <td className="text-right">{row.misses}</td>
                      <td className="text-right">{row.pending}</td>
                      <td className="text-right font-medium">
                        {row.hit_rate != null ? `%${Math.round(row.hit_rate * 100)}` : "—"}
                      </td>
                      <td className="text-right">
                        {row.avg_return != null ? `%${(+row.avg_return).toFixed(2)}` : "—"}
                      </td>
                      <td className="pl-3 text-xs text-muted-foreground">
                        {row.regime ? REGIME_LABEL[row.regime as Regime] ?? row.regime : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Otomatik ayar geçmişi</CardTitle>
          {tuneState.data && (
            <p className="text-xs text-muted-foreground">
              Şu anki eşik: <b>{Number(tuneState.data.min_confidence).toFixed(0)}</b>
              {tuneState.data.last_tuned_at && (
                <> · Son ayar: {new Date(tuneState.data.last_tuned_at).toLocaleString("tr-TR")}</>
              )}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {tune.data && tune.data.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {tune.data.map((row: any) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(row.tuned_at).toLocaleString("tr-TR")}
                  </span>
                  <Badge variant={row.action === "tighten" ? "destructive" : row.action === "loosen" ? "default" : "secondary"}>
                    {row.action === "tighten" ? "sıkılaştır" : row.action === "loosen" ? "gevşet" : row.action}
                  </Badge>
                  <span className="font-mono text-xs">
                    {row.prev_min_confidence} → <b>{row.new_min_confidence}</b>
                  </span>
                  <span className="w-full text-xs text-muted-foreground">{row.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz otomatik ayar yapılmadı. İlk gece denetimini bekleniyor.</p>
          )}
        </CardContent>
      </Card>
    </div>
    </AppShell>
  );
}
