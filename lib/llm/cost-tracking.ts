// Daily budget guardrail — query today's spend from ingestion_runs before allowing an LLM call.
// Throws BudgetExceededError if over budget. See AGENTS.md Rule 8.
//
// IMPORTANT: this is a server-only module (uses the service client).
// Cheap enough to call before every ingestion. For high-volume chat, consider
// caching the daily total in memory with a short TTL.

import '@/lib/utils/assert-server'
import { createServiceClient } from '@/lib/supabase/service'
import { BudgetExceededError } from '@/lib/utils/errors'

export interface BudgetStatus {
  spent_usd: number
  budget_usd: number
  remaining_usd: number
  exceeded: boolean
}

async function getTodaysSpend(): Promise<{ llm: number; embedding: number }> {
  const supa = createServiceClient()
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { data, error } = await supa
    .from('ingestion_runs')
    .select('llm_cost_usd, embedding_cost_usd')
    .gte('started_at', startOfDay.toISOString())

  if (error) {
    // Don't block the call on a Supabase blip — log and assume zero.
    console.error('cost-tracking: failed to query ingestion_runs', error)
    return { llm: 0, embedding: 0 }
  }

  let llm = 0
  let embedding = 0
  for (const row of data ?? []) {
    llm += Number(row.llm_cost_usd ?? 0)
    embedding += Number(row.embedding_cost_usd ?? 0)
  }
  return { llm, embedding }
}

export async function getBudgetStatus(): Promise<{
  llm: BudgetStatus
  embedding: BudgetStatus
}> {
  const llmBudget = Number(process.env.DAILY_LLM_BUDGET_USD ?? 20)
  const embeddingBudget = Number(process.env.DAILY_EMBEDDING_BUDGET_USD ?? 2)
  const spent = await getTodaysSpend()
  return {
    llm: {
      spent_usd: spent.llm,
      budget_usd: llmBudget,
      remaining_usd: Math.max(llmBudget - spent.llm, 0),
      exceeded: spent.llm >= llmBudget,
    },
    embedding: {
      spent_usd: spent.embedding,
      budget_usd: embeddingBudget,
      remaining_usd: Math.max(embeddingBudget - spent.embedding, 0),
      exceeded: spent.embedding >= embeddingBudget,
    },
  }
}

export async function assertWithinBudget(kind: 'llm' | 'embedding'): Promise<void> {
  const status = await getBudgetStatus()
  const s = status[kind]
  if (s.exceeded) throw new BudgetExceededError(kind, s.spent_usd, s.budget_usd)
}
