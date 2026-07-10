-- FAZ 4: Alternative Data & Sentiment Engine — news + macro storage.
-- Additive tables consumed by the Market Intelligence dashboard and Feature Store.

CREATE TABLE IF NOT EXISTS public.market_news (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol       text,
  source       text NOT NULL DEFAULT 'bilinmiyor',
  title        text NOT NULL,
  body         text,
  url          text,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_news_published_idx ON public.market_news (published_at DESC);
CREATE INDEX IF NOT EXISTS market_news_symbol_idx ON public.market_news (symbol);
CREATE UNIQUE INDEX IF NOT EXISTS market_news_dedupe_idx
  ON public.market_news (source, published_at, md5(title));

GRANT SELECT ON public.market_news TO anon;
GRANT SELECT ON public.market_news TO authenticated;
GRANT ALL ON public.market_news TO service_role;

ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_news public read" ON public.market_news FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.macro_indicators (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator  text NOT NULL,
  obs_date   date NOT NULL,
  value      double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indicator, obs_date)
);
CREATE INDEX IF NOT EXISTS macro_indicators_idx ON public.macro_indicators (indicator, obs_date DESC);

GRANT SELECT ON public.macro_indicators TO anon;
GRANT SELECT ON public.macro_indicators TO authenticated;
GRANT ALL ON public.macro_indicators TO service_role;

ALTER TABLE public.macro_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "macro_indicators public read" ON public.macro_indicators FOR SELECT TO anon, authenticated USING (true);