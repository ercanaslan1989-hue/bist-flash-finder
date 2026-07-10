import { createFileRoute } from "@tanstack/react-router";

// ============================================================================
// Ingestion endpoint for macro indicators (FAZ 4 alt-data). External feeders
// POST a JSON array of observations; rows are upserted into
// public.macro_indicators (unique per indicator + date) and surfaced on the
// Market Intelligence dashboard.
//
// Auth: send the project's anon/publishable key in the `apikey` header.
// Body: { items: [{ indicator, date, value }] }
// ============================================================================

const ALLOWED = new Set([
  "usdtry",
  "eurtry",
  "policy_rate",
  "cds",
  "gold",
  "oil",
  "bist100",
  "bist30",
  "viop",
]);

type MacroInput = { indicator?: string; date?: string; value?: number | null };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/ingest-macro")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anonKey =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        const provided =
          request.headers.get("apikey") || request.headers.get("x-api-key") || "";
        if (!anonKey || provided !== anonKey) {
          return json({ error: "Unauthorized" }, 401);
        }

        let payload: { items?: MacroInput[] };
        try {
          payload = (await request.json()) as { items?: MacroInput[] };
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        const rows = items
          .filter(
            (m) =>
              typeof m.indicator === "string" &&
              ALLOWED.has(m.indicator) &&
              typeof m.date === "string" &&
              /^\d{4}-\d{2}-\d{2}/.test(m.date) &&
              typeof m.value === "number" &&
              Number.isFinite(m.value),
          )
          .map((m) => ({
            indicator: m.indicator!,
            obs_date: m.date!.slice(0, 10),
            value: m.value as number,
          }));

        if (rows.length === 0) return json({ ok: true, inserted: 0 });

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { error } = await supabaseAdmin
          .from("macro_indicators")
          .upsert(rows, { onConflict: "indicator,obs_date" } as never);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, received: items.length, inserted: rows.length });
      },
    },
  },
});
