import { createFileRoute } from "@tanstack/react-router";

// ============================================================================
// Ingestion endpoint for market news (FAZ 4 alt-data). External feeders POST a
// JSON array of news items; rows are upserted into public.market_news and then
// picked up by the Market Intelligence dashboard + Feature Store automatically.
//
// Auth: send the project's anon/publishable key in the `apikey` header.
// Body: { items: [{ symbol?, source?, title, body?, url?, published_at? }] }
// ============================================================================

type NewsInput = {
  symbol?: string | null;
  source?: string | null;
  title?: string;
  body?: string | null;
  url?: string | null;
  published_at?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/ingest-news")({
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

        let payload: { items?: NewsInput[] };
        try {
          payload = (await request.json()) as { items?: NewsInput[] };
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        const rows = items
          .filter((n) => typeof n.title === "string" && n.title.trim().length > 0)
          .map((n) => ({
            symbol: n.symbol ?? null,
            source: (n.source ?? "bilinmiyor").toString().slice(0, 120),
            title: n.title!.trim().slice(0, 500),
            body: n.body ?? null,
            url: n.url ?? null,
            published_at: n.published_at ?? new Date().toISOString(),
          }));

        if (rows.length === 0) return json({ ok: true, inserted: 0 });

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const admin = supabaseAdmin as unknown as {
          from: (t: string) => any;
        };
        const { error } = await admin
          .from("market_news")
          .upsert(rows, {
            onConflict: "source,published_at,title",
            ignoreDuplicates: true,
          } as never);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, received: items.length, inserted: rows.length });
      },
    },
  },
});
