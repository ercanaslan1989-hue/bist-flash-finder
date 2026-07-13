import { createFileRoute } from "@tanstack/react-router";

// Public predictions API — exposes the daily recommendation scores together
// with the ensemble (Champion + ML Challenger) serving score for each symbol.
//
// The live Champion (Rule Engine) score is ALWAYS present. When an ensemble is
// marked active in the registry, an additional blended `ensembleScore` (and a
// per-member breakdown) is included; otherwise those fields are null and the
// response is Champion-only. Read-only, no PII — only public market signals.

const CACHE_TTL_MS = 60_000;

type PredictionItem = {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  aiScore: number;
  finalScore: number;
  blended: number;
  ensembleScore: number | null;
  ensembleDecision: boolean | null;
  members: { id: string; label: string; role: string; score: number }[] | null;
};

type PredictionsPayload = {
  ok: true;
  scoreDate: string | null;
  updatedAt: string | null;
  ensemble: { name: string; method: string; horizon: number } | null;
  count: number;
  predictions: PredictionItem[];
};

let cache: { at: number; payload: PredictionsPayload } | null = null;

export const Route = createFileRoute("/api/public/predictions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const now = Date.now();
        if (cache && now - cache.at < CACHE_TTL_MS) {
          return Response.json(cache.payload, {
            headers: { "Cache-Control": "public, max-age=30" },
          });
        }

        const url = new URL(request.url);
        const limitParam = Number(url.searchParams.get("limit"));
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;
        const onlyEnsemble = url.searchParams.get("decision") === "buy";

        const { fetchOpportunities } = await import("@/lib/opportunities");
        const data = await fetchOpportunities();

        let rows = data.rows;
        if (onlyEnsemble) rows = rows.filter((r) => r.ensembleDecision === true);

        const predictions: PredictionItem[] = rows.slice(0, limit).map((r) => ({
          symbol: r.symbol,
          company_name: r.company_name,
          sector: r.sector,
          aiScore: r.aiScore,
          finalScore: r.finalScore,
          blended: r.blended,
          ensembleScore: r.ensembleScore,
          ensembleDecision: r.ensembleDecision,
          members: r.ensembleMembers,
        }));

        const payload: PredictionsPayload = {
          ok: true,
          scoreDate: data.scoreDate,
          updatedAt: data.updatedAt,
          ensemble: data.ensemble,
          count: predictions.length,
          predictions,
        };
        cache = { at: now, payload };

        return Response.json(payload, {
          headers: { "Cache-Control": "public, max-age=30" },
        });
      },
    },
  },
});
