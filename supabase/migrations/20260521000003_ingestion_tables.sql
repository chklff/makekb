-- M1.7 — ingestion_runs (audit log) and ingestion_queue (work queue)

CREATE TABLE public.ingestion_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id         text NOT NULL,
  trigger             text NOT NULL CHECK (trigger IN ('manual','batch','webhook','recurring')),
  status              text NOT NULL CHECK (status IN (
    'success','skipped_hash_match','failed_fetch','failed_clean',
    'failed_llm','failed_embed','failed_insert'
  )),
  blueprint_hash      text,
  llm_model_used      text,
  llm_prompt_version  text,
  llm_tokens_in       int,
  llm_tokens_out      int,
  llm_cost_usd        numeric(10,4),
  embedding_tokens    int,
  embedding_cost_usd  numeric(10,4),
  duration_ms         int,
  error_message       text,
  error_stack         text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);

CREATE INDEX ON public.ingestion_runs (scenario_id, started_at DESC);
CREATE INDEX ON public.ingestion_runs (status, started_at DESC);

CREATE TABLE public.ingestion_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id     text NOT NULL,
  org_id          uuid REFERENCES public.make_organizations(id),
  team_id         uuid REFERENCES public.make_teams(id),
  folder_id       uuid REFERENCES public.make_folders(id),
  priority        int NOT NULL DEFAULT 5,
  attempts        int NOT NULL DEFAULT 0,
  locked_at       timestamptz,
  locked_by       text,
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_pending_scenario UNIQUE (scenario_id)
);

CREATE INDEX ON public.ingestion_queue (priority, enqueued_at) WHERE locked_at IS NULL;
