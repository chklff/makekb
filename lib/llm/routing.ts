// Model routing config. Stage → provider/model.
// Tweakable via env vars so a model swap is a config change, not a refactor.
// See /docs/archive/AI-Architecture.md §8 and DECISIONS.md.

export type LLMStage =
  | 'ingestion_analysis'
  | 'query_understanding'
  | 'chat_generation'
  | 'reuse_generation'

export const DEFAULT_MODELS: Record<LLMStage, string> = {
  ingestion_analysis: process.env.LLM_MODEL_ANALYSIS ?? 'claude-sonnet-4-5-20250929',
  query_understanding: process.env.LLM_MODEL_CHAT ?? 'claude-haiku-4-5-20251001',
  chat_generation: process.env.LLM_MODEL_CHAT ?? 'claude-haiku-4-5-20251001',
  reuse_generation: process.env.LLM_MODEL_REUSE ?? 'claude-sonnet-4-5-20250929',
}

// USD per 1M tokens (input / output). Update when Anthropic publishes new prices
// and bump the version in cost-tracking.ts.
export const PRICE_PER_MILLION_TOKENS: Record<string, { in: number; out: number }> = {
  // Anthropic
  'claude-sonnet-4-5-20250929': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  // Legacy fallback aliases
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

export const EMBEDDING_PRICE_PER_MILLION_TOKENS: Record<string, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
}

export function llmCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const rate = PRICE_PER_MILLION_TOKENS[model]
  if (!rate) return 0 // unknown model — log a warning at call site
  return (tokensIn * rate.in + tokensOut * rate.out) / 1_000_000
}

export function embeddingCostUsd(model: string, tokens: number): number {
  const rate = EMBEDDING_PRICE_PER_MILLION_TOKENS[model] ?? 0
  return (tokens * rate) / 1_000_000
}
