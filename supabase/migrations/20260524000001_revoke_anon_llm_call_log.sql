-- Catch-up: the original revoke_anon_grants migration (20260521000010) ran before
-- llm_call_log existed. Apply the same pattern so anon can't see the table via
-- GraphQL introspection. RLS already blocks authenticated reads (service_role-only
-- policy); this is defense-in-depth.

REVOKE SELECT ON public.llm_call_log FROM anon;
