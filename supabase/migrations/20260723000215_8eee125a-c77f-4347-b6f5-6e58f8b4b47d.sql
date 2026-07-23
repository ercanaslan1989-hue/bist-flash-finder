
CREATE TABLE public.prediction_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date DATE NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 20,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  misses INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  hit_rate NUMERIC(6,3),
  avg_return NUMERIC(8,3),
  avg_max_return NUMERIC(8,3),
  regime TEXT,
  notes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audit_date, window_days)
);
GRANT SELECT ON public.prediction_audit TO anon, authenticated;
GRANT ALL ON public.prediction_audit TO service_role;
ALTER TABLE public.prediction_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read" ON public.prediction_audit FOR SELECT USING (true);

CREATE TABLE public.model_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  regime TEXT NOT NULL,
  regime_score NUMERIC(6,3),
  bist_trend NUMERIC(8,3),
  bist_volatility NUMERIC(8,3),
  drift_psi NUMERIC(6,3),
  drift_level TEXT,
  calibration_error NUMERIC(6,3),
  calibration_bins JSONB,
  alerts JSONB,
  meta JSONB
);
GRANT SELECT ON public.model_health TO anon, authenticated;
GRANT ALL ON public.model_health TO service_role;
ALTER TABLE public.model_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health read" ON public.model_health FOR SELECT USING (true);
CREATE INDEX model_health_recent ON public.model_health (snapshot_at DESC);

CREATE TABLE public.retrain_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  regime TEXT,
  duration_ms INTEGER,
  summary JSONB,
  error TEXT
);
GRANT SELECT ON public.retrain_history TO anon, authenticated;
GRANT ALL ON public.retrain_history TO service_role;
ALTER TABLE public.retrain_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retrain read" ON public.retrain_history FOR SELECT USING (true);
