
REVOKE EXECUTE ON FUNCTION public.ai_discovery_run() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_ai_discovery(integer, integer, bigint) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.build_discovery_matrix() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.build_coverage_report() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_kap_features() FROM anon, authenticated, public;

ALTER FUNCTION public.normal_cdf(double precision) SET search_path = public;
