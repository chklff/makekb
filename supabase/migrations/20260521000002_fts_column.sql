-- M1.6 — Add full-text search support for hybrid retrieval.
-- See AI-Architecture.md §6.4 / Build-Brief §5.2 / DECISIONS.md "Hybrid retrieval"

ALTER TABLE public.make_scenarios
  ADD COLUMN search_text tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(scenario_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(one_line_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(business_purpose, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(full_description, '')), 'C')
  ) STORED;

CREATE INDEX make_scenarios_fts_idx
  ON public.make_scenarios USING gin (search_text);

CREATE INDEX make_scenarios_use_cases_idx
  ON public.make_scenarios USING gin (use_cases);
