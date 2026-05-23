-- M1.9 — scenario_patterns (template library, used by recompute-patterns job)
-- Structure created now; the clustering cron is enabled in v1.5 (see DECISIONS.md).

CREATE TABLE public.scenario_patterns (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid REFERENCES public.make_organizations(id),
  pattern_name                text NOT NULL,
  pattern_summary             text NOT NULL,
  category                    text,
  apps_in_pattern             jsonb,
  member_scenario_ids         uuid[],
  representative_scenario_id  uuid REFERENCES public.make_scenarios(id),
  embedding                   vector(1536),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.scenario_patterns USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON public.scenario_patterns (org_id);
CREATE INDEX ON public.scenario_patterns (category);
