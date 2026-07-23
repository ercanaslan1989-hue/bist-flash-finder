
CREATE TABLE IF NOT EXISTS public.auto_tune_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  min_confidence NUMERIC NOT NULL DEFAULT 60,
  min_weekly_target NUMERIC NOT NULL DEFAULT 10,
  disabled_patterns TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_hit_rate NUMERIC,
  last_tuned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes JSONB,
  CONSTRAINT auto_tune_singleton CHECK (id = 1)
);
GRANT SELECT ON public.auto_tune_state TO anon, authenticated;
GRANT ALL ON public.auto_tune_state TO service_role;
ALTER TABLE public.auto_tune_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read auto tune" ON public.auto_tune_state FOR SELECT USING (true);
INSERT INTO public.auto_tune_state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.auto_tune_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tuned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_min_confidence NUMERIC,
  new_min_confidence NUMERIC,
  hit_rate NUMERIC,
  sample_size INTEGER,
  action TEXT NOT NULL,
  reason TEXT,
  disabled_patterns TEXT[]
);
GRANT SELECT ON public.auto_tune_history TO anon, authenticated;
GRANT ALL ON public.auto_tune_history TO service_role;
ALTER TABLE public.auto_tune_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read tune history" ON public.auto_tune_history FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS auto_tune_history_tuned_at_idx ON public.auto_tune_history (tuned_at DESC);
