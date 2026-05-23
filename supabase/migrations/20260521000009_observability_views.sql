-- M1.31 — Observability views over ingestion_runs.
-- Read by Supabase dashboard + future Slack daily summary cron.

CREATE OR REPLACE VIEW public.vw_ingestion_health AS
SELECT
  date_trunc('hour', started_at) AS hour,
  count(*) FILTER (WHERE status = 'success')              AS successes,
  count(*) FILTER (WHERE status = 'skipped_hash_match')   AS skipped,
  count(*) FILTER (WHERE status LIKE 'failed_%')          AS failures,
  count(*)                                                AS total,
  round(avg(duration_ms))::int                            AS avg_duration_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95_duration_ms
FROM public.ingestion_runs
WHERE started_at > now() - interval '7 days'
GROUP BY hour
ORDER BY hour DESC;

CREATE OR REPLACE VIEW public.vw_daily_spend AS
SELECT
  date_trunc('day', started_at)::date AS day,
  coalesce(sum(llm_cost_usd), 0)       AS llm_usd,
  coalesce(sum(embedding_cost_usd), 0) AS embedding_usd,
  coalesce(sum(llm_cost_usd) + sum(embedding_cost_usd), 0) AS total_usd,
  count(*)                             AS runs,
  count(*) FILTER (WHERE status LIKE 'failed_%') AS failed_runs
FROM public.ingestion_runs
GROUP BY day
ORDER BY day DESC;

-- Authenticated users with admin role can read these dashboards.
-- (We'll add a real admin check in M2 — for now, service_role only via Edge Function fetch.)
REVOKE ALL ON public.vw_ingestion_health FROM anon, authenticated;
REVOKE ALL ON public.vw_daily_spend       FROM anon, authenticated;
