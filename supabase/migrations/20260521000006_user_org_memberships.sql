-- M1.10 — user_org_memberships (the auth → org bridge that RLS reads)

CREATE TABLE public.user_org_memberships (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.make_organizations(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

CREATE INDEX ON public.user_org_memberships (user_id);
CREATE INDEX ON public.user_org_memberships (org_id);
