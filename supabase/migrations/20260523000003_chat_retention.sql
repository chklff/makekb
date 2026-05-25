-- Auto-delete chat history older than 90 days. Keeps the DB small and limits
-- the blast radius of any future data leak — old questions + answers (which may
-- contain PII or sensitive business questions) don't linger forever.
--
-- Implementation: pg_cron nightly job at 03:30 UTC. Each run:
--   1. Delete chat_messages older than 90 days
--   2. Delete chat_conversations that have no remaining messages
--
-- pg_cron is pre-installed on Supabase Free + Pro. If you need to disable, run:
--   SELECT cron.unschedule('chat-retention-cleanup');

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: unschedule any prior job with the same name before re-scheduling.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-retention-cleanup') THEN
    PERFORM cron.unschedule('chat-retention-cleanup');
  END IF;
END $$;

SELECT cron.schedule(
  'chat-retention-cleanup',
  '30 3 * * *',  -- 03:30 UTC nightly
  $cron$
    -- Step 1: delete messages older than 90 days.
    DELETE FROM public.chat_messages
    WHERE created_at < now() - interval '90 days';

    -- Step 2: drop conversations whose last activity is also older than 90 days.
    DELETE FROM public.chat_conversations
    WHERE updated_at < now() - interval '90 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.conversation_id = chat_conversations.id
      );
  $cron$
);
