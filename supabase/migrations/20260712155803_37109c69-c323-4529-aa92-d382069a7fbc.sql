-- FAZ 5: Ensemble & Model Serving — persisted ensemble configurations.
CREATE TABLE public.ml_ensembles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  method text NOT NULL,
  horizon integer NOT NULL,
  champion_weight numeric,
  gate_confidence numeric,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_model_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  is_active boolean NOT NULL DEFAULT false,
  precision numeric,
  avg_return numeric,
  hit_rate numeric,
  signals integer,
  test_samples integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ml_ensembles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.ml_ensembles TO authenticated;
GRANT ALL ON public.ml_ensembles TO service_role;

ALTER TABLE public.ml_ensembles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ensembles are public readable"
  ON public.ml_ensembles FOR SELECT USING (true);
CREATE POLICY "Anyone can create ensembles"
  ON public.ml_ensembles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update ensembles"
  ON public.ml_ensembles FOR UPDATE USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ml_ensembles_updated_at
  BEFORE UPDATE ON public.ml_ensembles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();