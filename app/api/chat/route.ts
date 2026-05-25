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
import { enforceRateLimit } from '@/lib/rate-limit'
import { assertWithinBudget, logLlmCall } from '@/lib/llm/cost-tracking'
import { BudgetExceededError } from '@/lib/utils/errors'
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

  // 30 chats/min per user. At ~$0.005/call that's a $9/hour ceiling per user — high enough
  // that legit testers won't trip it, low enough that a runaway loop is bounded.
  const limited = enforceRateLimit({ key: `chat:${user.id}`, limit: 30, windowMs: 60_000 })
  if (limited) return limited

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

        // 5. Build the system prompt with sanitized scenario blocks.
        //    buildChatSystemPrompt() strips dangerous patterns (fake role headers,
        //    </scenarios> close tags, control chars) — see lib/llm/prompts/chat-system.ts.
        const scenariosForPrompt = results.map((r, i) => ({
          index: i + 1,
          scenario_name: r.scenario_name,
          one_line_summary: r.one_line_summary,
          category: r.category,
          trigger_type: r.trigger_type,
          trigger_app: r.trigger_app,
          apps_involved: r.apps_involved,
          make_scenario_id: r.make_scenario_id,
        }))

        // 6. Conversation history (last 6 turns, oldest first)
        const { data: history } = await supabase
          .from('chat_messages')
          .select('role, content')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(12)
        const historyMessages = ((history ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>).reverse()

        // 7. Stream answer from Haiku — but first check daily budget.
        try {
          await assertWithinBudget('llm')
        } catch (err) {
          if (err instanceof BudgetExceededError) {
            emit({ type: 'error', error: `Daily LLM budget reached. Reset at UTC midnight.` })
            controller.close()
            return
          }
          throw err
        }

        const systemPrompt = buildChatSystemPrompt(scenariosForPrompt)
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

        // 8b. Log to llm_call_log so the daily budget counts this call.
        if (lastUsage) {
          await logLlmCall({
            userId: user.id,
            stage: 'chat_generation',
            model: lastUsage.model,
            tokensIn: lastUsage.input_tokens,
            tokensOut: lastUsage.output_tokens,
            costUsd: lastUsage.cost_usd,
          })
        }

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
