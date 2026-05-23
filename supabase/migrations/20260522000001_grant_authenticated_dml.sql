-- Root cause: tables created via raw CREATE TABLE migrations don't get the
-- automatic GRANT to `authenticated` that Supabase's Table Editor adds. RLS
-- policies sit on top of these grants — if the grant is missing, RLS never
-- gets a chance to allow the read.

-- Read-only for authenticated (RLS narrows to "their org's rows" via policies).
GRANT SELECT ON public.make_organizations    TO authenticated;
GRANT SELECT ON public.make_teams            TO authenticated;
GRANT SELECT ON public.make_folders          TO authenticated;
GRANT SELECT ON public.make_users            TO authenticated;
GRANT SELECT ON public.scenario_patterns     TO authenticated;
GRANT SELECT ON public.user_org_memberships  TO authenticated;

-- Chat tables: users own their conversations + messages, so full DML.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages      TO authenticated;

-- ingestion_runs / ingestion_queue intentionally NOT granted to authenticated —
-- only the service-role-via-API-route is allowed to write to those.

-- Default privileges for future tables created by the postgres role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
