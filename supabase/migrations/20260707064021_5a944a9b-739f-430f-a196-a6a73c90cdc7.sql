-- FAZ 3: Machine Learning Model Registry & Champion-Challenger tables.
-- Append-only history: models are never deleted (no DELETE grant / policy).

CREATE TABLE public.ml_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  model_type text NOT NULL,
  horizon integer NOT NULL,
  feature_version text NOT NULL,
  feature_names text[] NOT NULL,
  params jsonb,
  data_start date,
  data_end date,
  train_samples integer,
  val_samples integer,
  test_samples integer,
  status text NOT NULL DEFAULT 'challenger',
  label_type text NOT NULL DEFAULT 'up',
  up_threshold numeric NOT NULL DEFAULT 0,
  model_blob jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ml_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.ml_models(id) ON DELETE CASCADE,
  dataset text NOT NULL,
  horizon integer NOT NULL,
  threshold numeric,
  signals integer,
  precision numeric,
  recall numeric,
  f1 numeric,
  roc_auc numeric,
  pr_auc numeric,
  accuracy numeric,
  avg_return numeric,
  profit_factor numeric,
  sharpe numeric,
  max_drawdown numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ml_champion_challenger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL DEFAULT now(),
  horizon integer NOT NULL,
  champion_id text NOT NULL DEFAULT 'rule_engine',
  champion_label text,
  challenger_model_id uuid REFERENCES public.ml_models(id) ON DELETE CASCADE,
  challenger_label text,
  champion_precision numeric,
  challenger_precision numeric,
  champion_avg_return numeric,
  challenger_avg_return numeric,
  champion_signals integer,
  challenger_signals integer,
  winner text,
  is_candidate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ml_metrics_model ON public.ml_metrics(model_id);
CREATE INDEX idx_ml_models_created ON public.ml_models(created_at DESC);
CREATE INDEX idx_ml_cc_model ON public.ml_champion_challenger(challenger_model_id);

GRANT SELECT, INSERT ON public.ml_models TO anon, authenticated;
GRANT SELECT, INSERT ON public.ml_metrics TO anon, authenticated;
GRANT SELECT, INSERT ON public.ml_champion_challenger TO anon, authenticated;
GRANT ALL ON public.ml_models TO service_role;
GRANT ALL ON public.ml_metrics TO service_role;
GRANT ALL ON public.ml_champion_challenger TO service_role;

ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_champion_challenger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ML models are public readable" ON public.ml_models FOR SELECT USING (true);
CREATE POLICY "Anyone can create ML models" ON public.ml_models FOR INSERT WITH CHECK (true);

CREATE POLICY "ML metrics are public readable" ON public.ml_metrics FOR SELECT USING (true);
CREATE POLICY "Anyone can create ML metrics" ON public.ml_metrics FOR INSERT WITH CHECK (true);

CREATE POLICY "ML CC are public readable" ON public.ml_champion_challenger FOR SELECT USING (true);
CREATE POLICY "Anyone can create ML CC" ON public.ml_champion_challenger FOR INSERT WITH CHECK (true);