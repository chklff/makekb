// POST /api/chat — authenticated, streaming NDJSON.
//
// Pipeline (one request):
//   1. Pull last 6 user/assistant turns from chat_messages (for memory)
//   2. Query understanding (Haiku) → filters
//   3. Hybrid retrieval → top 5 scenarios (RLS-scoped to caller's org)
//   4. Build context block + system prompt
//   5. Anthropic Haiku stream, emit text deltas + final usage
//   6. Persist user + assistant messages with cited scenario ids
//
// Stream events (NDJSON, one per line):
//   { type: 'meta', conversation_id, retrieved: SearchResult[] }
//   { type: 'delta', text: string }
//   { type: 'done', message_id, cited_scenario_ids, model, usage }
//   { type: 'error', error: string }

import { z } from 'zod'
import { requireUser, UnauthorizedResponse } from '@/lib/auth/require-session'
import { createClient } from '@/lib/supabase/server'
import { streamChat } from '@/lib/llm/anthropic'
import { buildChatSystemPrompt } from '@/lib/llm/prompts/chat-system'
import { hybridSearch, type SearchResult } from '@/lib/retrieval/hybrid-search'
import { logger } from '@/lib/utils/logger'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const Body = z.object({
  message: z.string().min(1).max(2000),
  conversation_id: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof UnauthorizedResponse) return e.response
    throw e
  }

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonErr({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const { message } = parsed.data
  let convIdOrNull: string | null = parsed.data.conversation_id ?? null

  const supabaseTyped = await createClient()
  // Supabase's generated types misbehave on conditional insert/update narrowing in dev
  // (works at runtime). Treat the client as untyped for the write paths in this route;
  // the RLS policies on chat_conversations/chat_messages are the real safety net.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseTyped as any
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      try {
        // 1. Ensure conversation
        if (!convIdOrNull) {
          const { data, error } = await supabase
            .from('chat_conversations')
            .insert({ user_id: user.id })
            .select('id')
            .single()
          if (error || !data) throw new Error(`Could not start conversation: ${error?.message}`)
          convIdOrNull = (data as { id: string }).id
        }
        const convId: string = convIdOrNull

        // 2. Persist user message immediately
        const { error: uErr } = await supabase.from('chat_messages').insert({
          conversation_id: convId,
          role: 'user',
          content: message,
        })
        if (uErr) logger.warn('failed to persist user message', { error: uErr.message })

        // 3. Hybrid retrieval — use the raw query for both embedding + FTS.
        // (Query-understanding/filter-extraction was tried but the Haiku model over-extracted
        // app filters that locked out matching scenarios with different app keys. Reintroduce
        // in v1.5 once we have an eval set to tune it against.)
        let results: SearchResult[] = []
        try {
          results = await hybridSearch(message, { limit: 5 })
        } catch (err) {
          emit({ type: 'error', error: `Retrieval failed: ${err instanceof Error ? err.message : String(err)}` })
          controller.close()
          return
        }

        emit({ type: 'meta', conversation_id: convId, retrieved: results })

        // 5. Build context block
        const context =
          results.length === 0
            ? '(no matching scenarios found in your KB)'
            : results
                .map((r, i) => {
                  return [
                    `[${i + 1}] ${r.scenario_name} (id=${r.make_scenario_id})`,
                    `Summary: ${r.one_line_summary ?? '(none)'}`,
                    `Category: ${r.category ?? '(none)'} · Complexity: ${r.complexity ?? '(none)'}`,
                    `Apps: ${r.apps_involved.join(', ') || '(none)'}`,
                    `Match score: ${r.score.toFixed(2)}`,
                  ].join('\n')
                })
                .join('\n\n')

        // 6. Conversation history (last 6 turns, oldest first)
        const { data: history } = await supabase
          .from('chat_messages')
          .select('role, content')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(12)
        const historyMessages = ((history ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>).reverse()

        // 7. Stream answer from Haiku
        const systemPrompt = buildChatSystemPrompt(context)
        let fullText = ''
        let lastUsage: { model: string; input_tokens: number; output_tokens: number; cost_usd: number } | null = null

        try {
          for await (const event of streamChat({
            systemPrompt,
            history: historyMessages,
            maxTokens: 1024,
          })) {
            if (event.kind === 'delta') {
              fullText += event.text
              emit({ type: 'delta', text: event.text })
            } else if (event.kind === 'usage') {
              lastUsage = event.usage
            }
          }
        } catch (err) {
          emit({ type: 'error', error: `LLM stream failed: ${err instanceof Error ? err.message : String(err)}` })
          controller.close()
          return
        }

        // 8. Persist assistant message
        const { data: assistantRowRaw } = await supabase
          .from('chat_messages')
          .insert({
            conversation_id: convId,
            role: 'assistant',
            content: fullText,
            cited_scenario_ids: results.map((r) => r.id),
            llm_model_used: lastUsage?.model ?? null,
            llm_tokens_in: lastUsage?.input_tokens ?? null,
            llm_tokens_out: lastUsage?.output_tokens ?? null,
          })
          .select('id')
          .single()
        const assistantRow = assistantRowRaw as { id: string } | null

        // 9. Bump conversation updated_at + title if first turn
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (historyMessages.length <= 1) {
          updates.title = message.length > 60 ? message.slice(0, 60) + '…' : message
        }
        await supabase.from('chat_conversations').update(updates).eq('id', convId)

        emit({
          type: 'done',
          message_id: assistantRow?.id ?? null,
          cited_scenario_ids: results.map((r) => r.id),
          model: lastUsage?.model ?? null,
          usage: lastUsage,
        })
        controller.close()
      } catch (err) {
        emit({ type: 'error', error: err instanceof Error ? err.message : String(err) })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

function jsonErr(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
