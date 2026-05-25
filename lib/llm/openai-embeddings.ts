// OpenAI embeddings wrapper. text-embedding-3-small (1536d).
// Used by: ingest-worker (after blueprint analysis), /api/search, /api/chat.

import '@/lib/utils/assert-server'
import OpenAI from 'openai'
import { EMBEDDING_PRICE_PER_MILLION_TOKENS, embeddingCostUsd } from './routing'

let _openai: OpenAI | null = null
function openai(): OpenAI {
  if (_openai) return _openai
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  _openai = new OpenAI({ apiKey })
  return _openai
}

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
const EMBEDDING_DIMS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1536)

export interface EmbedResult {
  vector: number[]
  model: string
  tokens: number
  cost_usd: number
}

export async function embed(text: string): Promise<EmbedResult> {
  if (!text.trim()) {
    return { vector: new Array(EMBEDDING_DIMS).fill(0), model: EMBEDDING_MODEL, tokens: 0, cost_usd: 0 }
  }
  if (!(EMBEDDING_MODEL in EMBEDDING_PRICE_PER_MILLION_TOKENS)) {
    console.warn(`embed: unknown model ${EMBEDDING_MODEL} — cost will be reported as $0`)
  }
  const resp = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: 'float',
  })
  const tokens = resp.usage?.total_tokens ?? 0
  return {
    vector: resp.data[0]!.embedding,
    model: EMBEDDING_MODEL,
    tokens,
    cost_usd: embeddingCostUsd(EMBEDDING_MODEL, tokens),
  }
}

export async function embedBatch(texts: string[]): Promise<EmbedResult[]> {
  if (texts.length === 0) return []
  const resp = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    encoding_format: 'float',
  })
  const totalTokens = resp.usage?.total_tokens ?? 0
  // OpenAI billing is by total tokens for the batch; spread cost proportionally for record-keeping.
  const perItemTokens = Math.round(totalTokens / Math.max(texts.length, 1))
  return resp.data.map((d) => ({
    vector: d.embedding,
    model: EMBEDDING_MODEL,
    tokens: perItemTokens,
    cost_usd: embeddingCostUsd(EMBEDDING_MODEL, perItemTokens),
  }))
}

/**
 * Build the embedding input string from an LLM analysis result.
 * Embed *meaning*, not JSON — see /docs/archive/AI-Architecture.md §4.3.
 *
 * `makeDescription` is the human-written "scenario settings → description" from Make.
 * When present we prepend it twice so it dominates the semantic vector — the author's
 * own words are the best single signal of intent for retrieval.
 */
export function buildEmbeddingInput(
  a: {
    one_line_summary: string
    business_purpose: string
    full_description: string
    data_flow: string
    apps_involved: string[]
    tags: string[]
    use_cases: string[]
    category: string
    trigger_event: string
    trigger_app: string
    trigger_type: string
  },
  makeDescription?: string | null,
): string {
  const humanDesc = makeDescription?.trim() ? `${makeDescription.trim()}. ${makeDescription.trim()}. ` : ''
  return [
    humanDesc,
    `${a.one_line_summary}.`,
    a.business_purpose,
    a.full_description,
    a.data_flow,
    `Apps: ${a.apps_involved.join(', ')}.`,
    `Tags: ${a.tags.join(', ')}.`,
    `Use cases: ${a.use_cases.join(', ')}.`,
    `Category: ${a.category}.`,
    `Trigger: ${a.trigger_event} via ${a.trigger_app} (${a.trigger_type}).`,
  ].join(' ')
}
