
CREATE TABLE public.stocks (
  symbol TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  shares_outstanding BIGINT NOT NULL DEFAULT 100000000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  day_index INT,
  symbol TEXT NOT NULL REFERENCES public.stocks(symbol) ON DELETE CASCADE,
  close NUMERIC(14,4) NOT NULL,
  daily_return_pct NUMERIC(10,4),
  volume BIGINT NOT NULL,
  vol_ratio_20d NUMERIC(10,4),
  vol_ratio_2d NUMERIC(10,4),
  vol_ratio_3d NUMERIC(10,4),
  ret_5d NUMERIC(10,4),
  ret_10d NUMERIC(10,4),
  ret_20d NUMERIC(10,4),
  ret_30d NUMERIC(10,4),
  market_value NUMERIC(20,2),
  daily_traded_value NUMERIC(20,2),
  kap_count INT NOT NULL DEFAULT 0,
  last_kap_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, symbol)
);
CREATE INDEX idx_snapshots_symbol_date ON public.daily_snapshots (symbol, snapshot_date);
CREATE INDEX idx_snapshots_date ON public.daily_snapshots (snapshot_date);

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL REFERENCES public.stocks(symbol) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  is_limit_up BOOLEAN NOT NULL DEFAULT false,
  daily_return_pct NUMERIC(10,4) NOT NULL,
  sector TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, event_date)
);
CREATE INDEX idx_events_type ON public.events (event_type);
CREATE INDEX idx_events_date ON public.events (event_date);

CREATE TABLE public.event_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  days_before INT NOT NULL,
  feature_date DATE NOT NULL,
  close NUMERIC(14,4),
  daily_return_pct NUMERIC(10,4),
  volume BIGINT,
  vol_ratio_20d NUMERIC(10,4),
  vol_ratio_2d NUMERIC(10,4),
  vol_ratio_3d NUMERIC(10,4),
  ret_5d NUMERIC(10,4),
  ret_10d NUMERIC(10,4),
  ret_20d NUMERIC(10,4),
  ret_30d NUMERIC(10,4),
  market_value NUMERIC(20,2),
  daily_traded_value NUMERIC(20,2),
  kap_count INT,
  sector TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, days_before)
);
CREATE INDEX idx_features_event ON public.event_features (event_id);
CREATE INDEX idx_features_days ON public.event_features (days_before);

-- Grants: research data is public read-only; writes only via backend/service role.
GRANT SELECT ON public.stocks TO anon, authenticated;
GRANT ALL ON public.stocks TO service_role;
GRANT SELECT ON public.daily_snapshots TO anon, authenticated;
GRANT ALL ON public.daily_snapshots TO service_role;
GRANT SELECT ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
GRANT SELECT ON public.event_features TO anon, authenticated;
GRANT ALL ON public.event_features TO service_role;

ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read stocks" ON public.stocks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read snapshots" ON public.daily_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read events" ON public.events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read event features" ON public.event_features FOR SELECT TO anon, authenticated USING (true);
