DROP INDEX IF EXISTS public.market_news_dedupe_idx;
CREATE UNIQUE INDEX IF NOT EXISTS market_news_dedupe_idx
  ON public.market_news (source, published_at, title);