CREATE OR REPLACE FUNCTION public.normal_cdf(x double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE t double precision; d double precision; p double precision;
BEGIN
  IF x IS NULL THEN RETURN NULL; END IF;
  -- Clamp extreme inputs to avoid float8 underflow in exp(-x*x/2)
  IF x >= 8.0 THEN RETURN 1.0; END IF;
  IF x <= -8.0 THEN RETURN 0.0; END IF;
  t := 1.0 / (1.0 + 0.2316419 * abs(x));
  d := 0.3989422804014327 * exp(-x * x / 2.0);
  p := d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  IF x > 0 THEN RETURN 1.0 - p; ELSE RETURN p; END IF;
END$function$;