-- M1.12b — Defense-in-depth: revoke anon SELECT on tables and revoke PUBLIC EXECUTE on user_org_ids.
-- RLS already blocks anon row reads; this also hides the schema from GraphQL introspection.
-- See Supabase advisor lints 0026 and 0028.

REVOKE SELECT ON public.make_organizations    FROM anon;
REVOKE SELECT ON public.make_teams            FROM anon;
REVOKE SELECT ON public.make_folders          FROM anon;
REVOKE SELECT ON public.make_users            FROM anon;
REVOKE SELECT ON public.make_scenarios        FROM anon;
REVOKE SELECT ON public.scenario_patterns     FROM anon;
REVOKE SELECT ON public.chat_conversations    FROM anon;
REVOKE SELECT ON public.chat_messages         FROM anon;
REVOKE SELECT ON public.user_org_memberships  FROM anon;
REVOKE SELECT ON public.ingestion_runs        FROM anon;
REVOKE SELECT ON public.ingestion_queue       FROM anon;

REVOKE EXECUTE ON FUNCTION public.user_org_ids() FROM PUBLIC, anon;
-- authenticated retains EXECUTE (granted in migration 7) — RLS policies need it.
