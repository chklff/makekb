-- M1.11 + M1.12 — Enable RLS on all 11 tables AND install policies in one transaction.
-- Doing both in one migration prevents an access gap where service_role would be locked out.

-- ──────────── Helper function ────────────
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM public.user_org_memberships WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;

-- ──────────── Enable RLS ────────────
ALTER TABLE public.make_organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_folders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_scenarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_patterns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_org_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_queue       ENABLE ROW LEVEL SECURITY;

-- ──────────── make_scenarios ────────────
CREATE POLICY "members read own org scenarios"
  ON public.make_scenarios FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "service_role full access scenarios"
  ON public.make_scenarios FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ──────────── make_organizations / teams / folders / users ────────────
CREATE POLICY "members read own orgs"
  ON public.make_organizations FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_org_ids()));

CREATE POLICY "members read own teams"
  ON public.make_teams FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "members read own folders"
  ON public.make_folders FOR SELECT TO authenticated
  USING (team_id IN (
    SELECT id FROM public.make_teams WHERE org_id IN (SELECT public.user_org_ids())
  ));

CREATE POLICY "members read make users"
  ON public.make_users FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service_role orgs"    ON public.make_organizations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role teams"   ON public.make_teams         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role folders" ON public.make_folders       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role mkusers" ON public.make_users         FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ──────────── scenario_patterns ────────────
CREATE POLICY "members read own patterns"
  ON public.scenario_patterns FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "service_role patterns"
  ON public.scenario_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ──────────── chat (per-user, not per-org) ────────────
CREATE POLICY "users own conversations"
  ON public.chat_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users own messages"
  ON public.chat_messages FOR ALL TO authenticated
  USING (conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = auth.uid()
  ))
  WITH CHECK (conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = auth.uid()
  ));

-- ──────────── user_org_memberships ────────────
CREATE POLICY "users see own memberships"
  ON public.user_org_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "service_role memberships"
  ON public.user_org_memberships FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ──────────── ingestion (service_role only) ────────────
CREATE POLICY "service_role runs"  ON public.ingestion_runs   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role queue" ON public.ingestion_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
