-- v0.1.2 — Pull Make's own scenario description + interface spec into the KB.
-- See DECISIONS.md "Use Make's native description + interface" (2026-05-25).
--
-- `make_description` is the free-text "scenario settings → description" field humans
-- write in Make. Where filled, it's the best single signal of intent.
-- `make_interface` is the JSON returned by GET /scenarios/{id}/interface — webhook
-- input schema for triggered scenarios, output schema for scenarios callable as
-- sub-scenarios. We store it raw for now and surface fields downstream as needed.

ALTER TABLE public.make_scenarios
  ADD COLUMN IF NOT EXISTS make_description text,
  ADD COLUMN IF NOT EXISTS make_interface   jsonb;

-- Rebuild the FTS column to include the human description at the highest weight ('A').
-- We can't ALTER a STORED generated column in place — drop + recreate.
DROP INDEX IF EXISTS public.make_scenarios_fts_idx;
ALTER TABLE public.make_scenarios DROP COLUMN IF EXISTS search_text;

ALTER TABLE public.make_scenarios
  ADD COLUMN search_text tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(scenario_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(make_description, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(one_line_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(business_purpose, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(full_description, '')), 'C')
  ) STORED;

CREATE INDEX make_scenarios_fts_idx
  ON public.make_scenarios USING gin (search_text);
