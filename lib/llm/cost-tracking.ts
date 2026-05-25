// Daily budget guardrail — query today's total LLM + embedding spend before allowing a call.
// Throws BudgetExceededError if over budget. See AGENTS.md Rule 8.
//
// Counts spend from BOTH:
//   - ingestion_runs (analysis pipeline writes here)
//   - llm_call_log   (chat + reuse routes write here)
//
// IMPORTANT: this is a server-only module (uses the service client).
// To avoid a DB roundtrip per chat message (30/min/user × 5 users = 150 calls/min),
// the budget status is memoized for 60s. Spend overruns can therefore exceed the cap
// by ~60s of activity — acceptable trade.

import '@/lib/utils/assert-server'
import { createServiceClient } from '@/lib/supabase/service'
import { BudgetExceededError } from '@/lib/utils/errors'
import { llmCostUsd } from './routing'
import { logger } from '@/lib/utils/logger'

export interface BudgetStatus {
  spent_usd: number
  budget_usd: number
  remaining_usd: number
  exceeded: boolean
}

// ──────────────────────────────────────────────────────────
// Memo cache — 60s TTL. Survives across requests in the same process.
// ──────────────────────────────────────────────────────────

interface CachedBudget {
  fetchedAt: number
  llm: { spent: number; budget: number }
  embedding: { spent: number; budget: number }
}

let cache: CachedBudget | null = null
const CACHE_TTL_MS = 60_000

function invalidateBudgetCache() {
  cache = null
}

async function getTodaysSpend(): Promise<{ llm: number; embedding: number }> {
  const supa = createServiceClient()
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const startIso = startOfDay.toISOString()

  // Two queries in parallel. Both return small daily rowcounts.
  const [ingestRes, chatRes] = await Promise.all([
    supa
      .from('ingestion_runs')
      .select('llm_cost_usd, embedding_cost_usd')
      .gte('started_at', startIso),
    supa.from('llm_call_log').select('cost_usd').gte('created_at', startIso),
  ])

  if (ingestRes.error) {
    logger.error('cost-tracking: ingestion_runs query failed', { error: ingestRes.error.message })
  }
  if (chatRes.error) {
    logger.error('cost-tracking: llm_call_log query failed', { error: chatRes.error.message })
  }

  let llm = 0
  let embedding = 0
  for (const row of ingestRes.data ?? []) {
    llm += Number(row.llm_cost_usd ?? 0)
    embedding += Number(row.embedding_cost_usd ?? 0)
  }
  for (const row of chatRes.data ?? []) {
    llm += Number(row.cost_usd ?? 0)
  }
  return { llm, embedding }
}

export async function getBudgetStatus(opts: { fresh?: boolean } = {}): Promise<{
  llm: BudgetStatus
  embedding: BudgetStatus
}> {
  const llmBudget = Number(process.env.DAILY_LLM_BUDGET_USD ?? 20)
  const embeddingBudget = Number(process.env.DAILY_EMBEDDING_BUDGET_USD ?? 2)

  // Use cache if fresh enough and caller didn't ask for fresh.
  const now = Date.now()
  if (!opts.fresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      llm: budgetStatus(cache.llm.spent, llmBudget),
      embedding: budgetStatus(cache.embedding.spent, embeddingBudget),
    }
  }

  const spent = await getTodaysSpend()
  cache = {
    fetchedAt: now,
    llm: { spent: spent.llm, budget: llmBudget },
    embedding: { spent: spent.embedding, budget: embeddingBudget },
  }
  return {
    llm: budgetStatus(spent.llm, llmBudget),
    embedding: budgetStatus(spent.embedding, embeddingBudget),
  }
}

function budgetStatus(spent: number, budget: number): BudgetStatus {
  return {
    spent_usd: spent,
    budget_usd: budget,
    remaining_usd: Math.max(budget - spent, 0),
    exceeded: spent >= budget,
  }
}

export async function assertWithinBudget(kind: 'llm' | 'embedding'): Promise<void> {
  const status = await getBudgetStatus()
  const s = status[kind]
  if (s.exceeded) throw new BudgetExceededError(kind, s.spent_usd, s.budget_usd)
}

// ──────────────────────────────────────────────────────────
// Write side
// ──────────────────────────────────────────────────────────

export interface LogLlmCallInput {
  userId: string | null
  stage: 'chat_generation' | 'reuse_generation' | 'query_understanding'
  model: string
  tokensIn: number
  tokensOut: number
  /** If omitted, computed from pricing table. */
  costUsd?: number
}

/**
 * Log an LLM call to `llm_call_log` so it counts against the daily budget.
 * Never throws — failure here shouldn't break the user's request.
 */
export async function logLlmCall(input: LogLlmCallInput): Promise<void> {
  const cost = input.costUsd ?? llmCostUsd(input.model, input.tokensIn, input.tokensOut)
  try {
    const supa = createServiceClient()
    await supa.from('llm_call_log').insert({
      user_id: input.userId,
      stage: input.stage,
      model: input.model,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
      cost_usd: cost,
    })
    // Bust the cache so the next budget check sees the new spend.
    invalidateBudgetCache()
  } catch (err) {
    logger.error('logLlmCall failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
