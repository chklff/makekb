-- M1.8 — chat_conversations + chat_messages

CREATE TABLE public.chat_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES public.make_organizations(id),
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.chat_conversations (user_id, updated_at DESC);

CREATE TABLE public.chat_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role                text NOT NULL CHECK (role IN ('user','assistant')),
  content             text NOT NULL,
  cited_scenario_ids  uuid[],
  llm_model_used      text,
  llm_tokens_in       int,
  llm_tokens_out      int,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.chat_messages (conversation_id, created_at);
