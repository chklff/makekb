-- LLM call audit log for chat + reuse (analysis already logs to ingestion_runs).
-- Used by lib/llm/cost-tracking.ts to enforce DAILY_LLM_BUDGET_USD across all surfaces.

CREATE TABLE public.llm_call_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stage       text NOT NULL CHECK (stage IN ('chat_generation', 'reuse_generation', 'query_understanding')),
  model       text NOT NULL,
  tokens_in   int NOT NULL DEFAULT 0,
  tokens_out  int NOT NULL DEFAULT 0,
  cost_usd    numeric(10,4) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexed on created_at for the daily-spend rollup query.
CREATE INDEX llm_call_log_created_at_idx ON public.llm_call_log (created_at DESC);
CREATE INDEX llm_call_log_user_id_idx    ON public.llm_call_log (user_id, created_at DESC);

-- RLS: service_role only. The API routes write via the service client; users never read directly.
ALTER TABLE public.llm_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role llm_call_log" ON public.llm_call_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.llm_call_log TO service_role;
