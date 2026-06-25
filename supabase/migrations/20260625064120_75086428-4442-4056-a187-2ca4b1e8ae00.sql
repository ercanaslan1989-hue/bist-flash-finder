CREATE OR REPLACE FUNCTION public.ai_stage_quality()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '0'
AS $function$
DECLARE _run bigint;
BEGIN
  SELECT run_id INTO _run FROM public.ai_progress WHERE id=1;

  TRUNCATE public.ai_top_patterns;
  INSERT INTO public.ai_top_patterns(rank,target_key,horizon,label,pred_keys,n_preds,
    occurrences,successes,failures,precision_pct,recall_pct,fpr_pct,base_rate_pct,lift,
    z_score,p_value,ci_low,ci_high,avg_fwd,median_fwd,avg_days_to_target,overfit,robust)
  SELECT row_number() OVER (ORDER BY (NOT coalesce(overfit,true)) DESC, z_score DESC NULLS LAST, lift DESC NULLS LAST, precision_pct DESC NULLS LAST),
    target_key,horizon,label,pred_keys,n_preds,occurrences,successes,failures,precision_pct,recall_pct,fpr_pct,base_rate_pct,lift,
    z_score,p_value,ci_low,ci_high,avg_fwd,median_fwd,avg_days_to_target,overfit,robust
  FROM public.ai_patterns
  WHERE coalesce(significant,false)
  ORDER BY (NOT coalesce(overfit,true)) DESC, z_score DESC NULLS LAST, lift DESC NULLS LAST, precision_pct DESC NULLS LAST
  LIMIT 100;

  TRUNCATE public.ai_top_signals;
  INSERT INTO public.ai_top_signals(rank,target_key,horizon,label,pred_keys,occurrences,precision_pct,lift,ci_low,z_score,confidence)
  SELECT row_number() OVER (ORDER BY ci_low DESC NULLS LAST, z_score DESC NULLS LAST, precision_pct DESC NULLS LAST),
    target_key,horizon,label,pred_keys,occurrences,precision_pct,lift,ci_low,z_score, round(ci_low,2)
  FROM public.ai_patterns
  WHERE coalesce(robust,false)
  ORDER BY ci_low DESC NULLS LAST, z_score DESC NULLS LAST, precision_pct DESC NULLS LAST
  LIMIT 20;

  TRUNCATE public.ai_feature_importance;
  INSERT INTO public.ai_feature_importance(target_key,pred_key,label,feature_group,appearances,avg_precision,avg_lift,best_precision,importance)
  SELECT p.target_key, u.k, coalesce(pc.label,u.k), coalesce(pc.feature_group,'other'),
    count(*), round(avg(p.precision_pct),2), round(avg(p.lift),3), round(max(p.precision_pct),2),
    round((sum(p.lift * ln(p.occurrences + 1)))::numeric,3)
  FROM public.ai_patterns p
  CROSS JOIN LATERAL unnest(p.pred_keys) u(k)
  LEFT JOIN public.pred_catalog pc ON pc.pred_key = u.k
  WHERE coalesce(p.robust,false) OR coalesce(p.significant,false)
  GROUP BY p.target_key, u.k, pc.label, pc.feature_group;
  UPDATE public.ai_feature_importance fi SET rank = x.r
  FROM (SELECT id, row_number() OVER (PARTITION BY target_key ORDER BY importance DESC) r FROM public.ai_feature_importance) x
  WHERE fi.id = x.id;

  TRUNCATE public.ai_pattern_rows;
  INSERT INTO public.ai_pattern_rows(pattern_id, row_id)
  SELECT tp.id, mf.row_id
  FROM public.ai_top_patterns tp
  JOIN public.ai_mf mf ON mf.pred_key = ANY(tp.pred_keys)
  WHERE mf.pred_key IN (SELECT DISTINCT unnest(pred_keys) FROM public.ai_top_patterns)
  GROUP BY tp.id, mf.row_id, tp.n_preds
  HAVING count(*) = tp.n_preds;

  INSERT INTO public.ai_signal_quality(run_id, run_date, target_key, n_patterns, n_significant, top_precision, top_lift, best_label)
  SELECT _run, current_date, target_key, count(*), count(*) FILTER (WHERE significant),
         max(precision_pct), max(lift), (array_agg(label ORDER BY rank))[1]
  FROM public.ai_patterns GROUP BY target_key;

  UPDATE public.ai_progress SET stage='oos', phase='Out-of-sample validation',
    pct=96, stage_started_at=now(), updated_at=now() WHERE id=1;
END$function$;