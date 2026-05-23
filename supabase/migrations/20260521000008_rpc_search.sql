-- M1.13 — search_scenarios RPC. Hybrid vector + FTS + JSONB filters.
-- SECURITY INVOKER so RLS applies — user only ever sees their own org's rows.
-- Called from /api/search, /api/chat, /api/reuse.

CREATE OR REPLACE FUNCTION public.search_scenarios(
  p_query_embedding   vector(1536),
  p_query_text        text,
  p_apps              jsonb DEFAULT NULL,
  p_categories        text[] DEFAULT NULL,
  p_trigger_types     text[] DEFAULT NULL,
  p_team_ids          uuid[] DEFAULT NULL,
  p_complexity        text[] DEFAULT NULL,
  p_match_count       int DEFAULT 10,
  p_vector_weight     numeric DEFAULT 0.7
)
RETURNS TABLE (
  id                  uuid,
  make_scenario_id    text,
  scenario_name       text,
  one_line_summary    text,
  category            text,
  trigger_type        text,
  trigger_app         text,
  apps_involved       jsonb,
  tags                jsonb,
  team_name           text,
  complexity          text,
  score               numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH apps_filter AS (
    SELECT CASE
      WHEN p_apps IS NULL THEN NULL
      ELSE (SELECT array_agg(value) FROM jsonb_array_elements_text(p_apps) AS t(value))
    END AS apps_array
  ),
  candidates AS (
    SELECT
      s.id, s.make_scenario_id, s.scenario_name, s.one_line_summary,
      s.category, s.trigger_type, s.trigger_app, s.apps_involved,
      s.tags, s.team_name, s.complexity, s.embedding, s.search_text
    FROM public.make_scenarios s, apps_filter af
    WHERE (af.apps_array     IS NULL OR s.apps_involved ?| af.apps_array)
      AND (p_categories     IS NULL OR s.category = ANY(p_categories))
      AND (p_trigger_types  IS NULL OR s.trigger_type = ANY(p_trigger_types))
      AND (p_team_ids       IS NULL OR s.team_id = ANY(p_team_ids))
      AND (p_complexity     IS NULL OR s.complexity = ANY(p_complexity))
      AND s.embedding IS NOT NULL
  ),
  scored AS (
    SELECT
      c.*,
      (1 - (c.embedding <=> p_query_embedding)) AS vec_score,
      COALESCE(ts_rank_cd(c.search_text, websearch_to_tsquery('english', coalesce(p_query_text,''))), 0) AS fts_score
    FROM candidates c
  )
  SELECT
    id, make_scenario_id, scenario_name, one_line_summary,
    category, trigger_type, trigger_app, apps_involved, tags,
    team_name, complexity,
    (p_vector_weight * vec_score + (1 - p_vector_weight) * LEAST(fts_score, 1.0))::numeric AS score
  FROM scored
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION public.search_scenarios TO authenticated;
