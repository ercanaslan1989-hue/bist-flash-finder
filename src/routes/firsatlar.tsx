import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, AlertOctagon, Filter, Radio, RefreshCw, RotateCcw, SlidersHorizontal } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { OpportunityTable } from "@/components/opportunity-table";
import { Skeleton } from "@/components/ui/skeleton";
import { opportunitiesQueryOptions, type OpportunityRow } from "@/lib/opportunities";
import { useMarketOpen, REFRESH_MS } from "@/hooks/use-market-open";
import { fmtDate, fmtDateShort, fmtUpdatedTSI, dataFreshness } from "@/lib/format";

export const Route = createFileRoute("/firsatlar")({
  head: () => ({
    meta: [
      { title: "Akıllı Fırsat Filtreleme — BIST Sinyal Araştırma Lab" },
      {
        name: "description",
        content:
          "Tüm aktif BIST hisselerini AI skoru, güven, beklenen hareket, sektör, RSI, hacim artışı, piyasa değeri, kalıp sayısı ve volatiliteye göre anlık filtreleyin. Yalnızca araştırma amaçlıdır.",
      },
    ],
  }),
  component: FirsatlarPage,
});

const TARGETS = [
  { value: "", label: "Tümü" },
  { value: "lu", label: "Tavan" },
  { value: "g20", label: "+%20" },
  { value: "g15", label: "+%15" },
  { value: "g10", label: "+%10" },
];

interface Filters {
  minScore: number;
  minConfidence: number;
  target: string;
  sector: string;
  rsiMin: number;
  rsiMax: number;
  minVolInc: number;
  minMarketCap: number;
  minPatterns: number;
  maxVolatility: number;
}

const DEFAULTS: Filters = {
  minScore: 0,
  minConfidence: 0,
  target: "",
  sector: "",
  rsiMin: 0,
  rsiMax: 100,
  minVolInc: -100,
  minMarketCap: 0,
  minPatterns: 0,
  maxVolatility: 1000,
};

function applyFilters(rows: OpportunityRow[], f: Filters): OpportunityRow[] {
  return rows.filter((r) => {
    if (r.aiScore < f.minScore) return false;
    if ((r.confidence ?? 0) < f.minConfidence) return false;
    if (f.target && r.bestTarget !== f.target) return false;
    if (f.sector && r.sector !== f.sector) return false;
    if (r.rsi !== null && (r.rsi < f.rsiMin || r.rsi > f.rsiMax)) return false;
    if ((r.volumeIncrease ?? -Infinity) < f.minVolInc) return false;
    if ((r.marketCap ?? 0) < f.minMarketCap) return false;
    if (r.matchedPatterns < f.minPatterns) return false;
    if ((r.volatility ?? 0) > f.maxVolatility) return false;
    return true;
  });
}

function FirsatlarPage() {
  const marketOpen = useMarketOpen();
  const { data, isPending, isFetching, refetch } = useQuery({
    ...opportunitiesQueryOptions(),
    refetchInterval: marketOpen ? REFRESH_MS : false,
    refetchOnWindowFocus: marketOpen,
  });
  const [f, setF] = useState<Filters>(DEFAULTS);

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, f), [rows, f]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  const fresh = dataFreshness(data?.scoreDate);

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative px-6 py-8 sm:px-10 sm:py-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Akıllı Filtreleme
          </span>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Tüm fırsatları <span className="text-primary">filtrele</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            AI skoru, güven, beklenen hareket, sektör, RSI, hacim artışı, piyasa değeri, kalıp sayısı ve
            volatiliteye göre anlık filtreleyin. Filtreler değiştikçe liste anında güncellenir.
          </p>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {data?.updatedAt ? (
            <span>
              Son güncelleme:{" "}
              <span className="font-medium text-foreground">{fmtUpdatedTSI(data.updatedAt)}</span>
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
          title="En son veriyi kontrol et"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Yenileniyor" : "Yenile"}
        </button>
      </div>

      {!isPending && fresh.tier !== "fresh" && (
        <div
          role="alert"
          className={
            fresh.tier === "critical"
              ? "mt-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
              : "mt-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
          }
        >
          {fresh.tier === "critical" ? (
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          )}
          <div className="text-sm">
            <p className={`font-semibold ${fresh.tier === "critical" ? "text-destructive" : "text-warning"}`}>
              {fresh.label}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Sistemdeki en güncel veriler {fmtDate(data?.scoreDate)} tarihine ait (son veri:{" "}
              {fmtDateShort(data?.scoreDate)}). Yeni veriler günlük toplama işlemi tamamlandığında
              otomatik olarak burada görünecektir.
              {data?.updatedAt ? ` Son kontrol: ${fmtUpdatedTSI(data.updatedAt)}.` : ""}
            </p>
          </div>
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Analiz edilen hisseler" value={isPending ? "…" : rows.length.toString()} />
        <StatCard label="Filtre sonucu" value={isPending ? "…" : filtered.length.toString()} accent="primary" />
        <StatCard
          label="Piyasa durumu"
          value={<span className="text-base">{marketOpen ? "Açık" : "Kapalı"}</span>}
          icon={<Radio className="h-4 w-4" />}
          accent={marketOpen ? "success" : "default"}
        />
        <StatCard
          label="Analiz tarihi"
          value={<span className="text-base">{data?.scoreDate ? fmtDate(data.scoreDate) : "—"}</span>}
          sub={
            fresh.tier === "critical" ? (
              <span className="text-destructive">{fresh.label}</span>
            ) : fresh.tier === "warn" ? (
              <span className="text-warning">{fresh.label}</span>
            ) : undefined
          }
        />
      </section>



      <section className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-accent" />
            <h2 className="font-display text-sm font-semibold text-foreground">Filtreler</h2>
          </div>
          <button
            onClick={() => setF(DEFAULTS)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Sıfırla
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeField
            label="AI Skoru (min)"
            value={f.minScore}
            min={0}
            max={100}
            onChange={(v) => set("minScore", v)}
          />
          <RangeField
            label="Güven Skoru (min %)"
            value={f.minConfidence}
            min={0}
            max={35}
            onChange={(v) => set("minConfidence", v)}
          />
          <RangeField
            label="Kalıp Sayısı (min)"
            value={f.minPatterns}
            min={0}
            max={100}
            onChange={(v) => set("minPatterns", v)}
          />
          <SelectField
            label="Beklenen Hareket"
            value={f.target}
            options={TARGETS}
            onChange={(v) => set("target", v)}
          />
          <SelectField
            label="Sektör"
            value={f.sector}
            options={[
              { value: "", label: "Tümü" },
              ...(data?.sectors ?? []).map((s) => ({ value: s, label: s })),
            ]}
            onChange={(v) => set("sector", v)}
          />
          <RangeField
            label="Hacim Artışı (min %)"
            value={f.minVolInc}
            min={-100}
            max={500}
            step={10}
            onChange={(v) => set("minVolInc", v)}
          />
          <DualRange
            label="RSI Aralığı"
            lo={f.rsiMin}
            hi={f.rsiMax}
            onLo={(v) => set("rsiMin", v)}
            onHi={(v) => set("rsiMax", v)}
          />
          <RangeField
            label="Volatilite (maks %)"
            value={f.maxVolatility}
            min={0}
            max={1000}
            step={25}
            onChange={(v) => set("maxVolatility", v)}
            displayMax="Sınırsız"
          />
          <NumberField
            label="Piyasa Değeri (min ₺M)"
            value={f.minMarketCap / 1e6}
            onChange={(v) => set("minMarketCap", v * 1e6)}
          />
        </div>
      </section>

      <section className="mt-6">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          <OpportunityTable rows={filtered} />
        )}
      </section>
    </AppShell>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  displayMax,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  displayMax?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-xs font-semibold text-foreground tabular">
          {displayMax && value >= max ? displayMax : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </label>
  );
}

function DualRange({
  label,
  lo,
  hi,
  onLo,
  onHi,
}: {
  label: string;
  lo: number;
  hi: number;
  onLo: (v: number) => void;
  onHi: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-xs font-semibold text-foreground tabular">
          {lo} – {hi}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          value={lo}
          onChange={(e) => onLo(Math.min(Number(e.target.value), hi))}
          className="w-full accent-primary"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={hi}
          onChange={(e) => onHi(Math.max(Number(e.target.value), lo))}
          className="w-full accent-primary"
        />
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-9 w-full rounded-md border border-border bg-secondary/40 px-2 text-sm text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
        className="mt-2 h-9 w-full rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground"
      />
    </label>
  );
}
