// Anthropic SDK wrapper. Three call shapes:
//   1) analyzeBlueprint  — structured output via tool-use, validated with Zod
//   2) extractFilters    — same pattern, smaller model (Haiku)
//   3) generateReuse     — structured output for blueprint generation
//
// All three: temperature=0, pinned model, retry-once on invalid output, cost-tracked.

import '@/lib/utils/assert-server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { DEFAULT_MODELS, llmCostUsd } from './routing'
import { ANALYSIS_SCHEMA, AnalysisOutput, type AnalysisOutputT } from './prompts/analysis-schema'
import { ANALYSIS_SYSTEM_PROMPT } from './prompts/analysis-system'
import {
  QUERY_UNDERSTANDING_SCHEMA,
  QUERY_UNDERSTANDING_SYSTEM,
  QueryFiltersSchema,
  type QueryFiltersT,
} from './prompts/query-understanding'
import { REUSE_OUTPUT_SCHEMA, REUSE_SYSTEM_PROMPT, ReuseOutput, type ReuseOutputT } from './prompts/reuse-system'
import { LLMRateLimitError, LLMValidationError } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

// Cast through unknown so the JSON-Schema `as const` literal types line up with the SDK's
// looser `Anthropic.Tool.InputSchema` type without us hand-rewriting the schema.
type InputSchema = Anthropic.Messages.Tool.InputSchema

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

interface UsageInfo {
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

interface StructuredCallResult<T> {
  output: T
  usage: UsageInfo
}

/** Internal: one structured-output call with optional retry. */
async function structuredCall<T>(opts: {
  model: string
  system: string
  user: string
  toolName: string
  inputSchema: object
  validator: z.ZodType<T>
  maxTokens?: number
  retryOnce?: boolean
}): Promise<StructuredCallResult<T>> {
  const { model, system, user, toolName, inputSchema, validator, maxTokens = 2000, retryOnce = true } = opts

  async function once(temperature: number, nudge?: string): Promise<StructuredCallResult<T>> {
    try {
      const resp = await anthropic().messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        tools: [
          {
            name: toolName,
            description: `Submit the structured ${toolName} result.`,
            input_schema: inputSchema as unknown as InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: nudge ? `${user}\n\n${nudge}` : user }],
      })

      // Find the tool_use block.
      const toolBlock = resp.content.find((b) => b.type === 'tool_use')
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        throw new LLMValidationError('No tool_use block in Anthropic response')
      }
      const parsed = validator.safeParse(toolBlock.input)
      if (!parsed.success) {
        throw new LLMValidationError('Tool output failed schema validation', {
          issues: parsed.error.issues,
        })
      }

      const usage = resp.usage
      return {
        output: parsed.data,
        usage: {
          model,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cost_usd: llmCostUsd(model, usage.input_tokens, usage.output_tokens),
        },
      }
    } catch (err) {
      // Map rate-limit/overload to a retryable error class.
      if (
        err instanceof Anthropic.APIError &&
        (err.status === 429 || err.status === 529 || err.status === 503)
      ) {
        throw new LLMRateLimitError(`Anthropic ${err.status}: ${err.message}`)
      }
      throw err
    }
  }

  try {
    return await once(0)
  } catch (err) {
    if (!retryOnce || err instanceof LLMRateLimitError) throw err
    if (err instanceof LLMValidationError) {
      logger.warn('llm.retry', { model, reason: 'validation', issues: err.meta })
      return await once(0.1, 'Your previous response failed schema validation. Return ONLY a single call to the tool with valid arguments matching the schema. No prose.')
    }
    throw err
  }
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

export async function analyzeBlueprint(args: {
  scenarioName: string
  cleanedBlueprint: unknown
  folderName?: string
  teamName?: string
  /** The author's free-text "scenario settings → description" from Make. Optional. */
  description?: string | null
  /** GET /scenarios/{id}/interface payload. Optional. */
  interfaceSpec?: unknown
}): Promise<StructuredCallResult<AnalysisOutputT> & { prompt_version: string }> {
  const userMsg = [
    `Analyze this Make.com scenario and submit via the tool.`,
    ``,
    `Scenario name: ${args.scenarioName}`,
    args.folderName ? `Folder: ${args.folderName}` : null,
    args.teamName ? `Team: ${args.teamName}` : null,
    ``,
    args.description?.trim()
      ? `HUMAN DESCRIPTION (highest-trust signal of intent):\n${args.description.trim()}\n`
      : null,
    args.interfaceSpec
      ? `INTERFACE (input/output spec):\n${JSON.stringify(args.interfaceSpec)}\n`
      : null,
    `BLUEPRINT:`,
    JSON.stringify(args.cleanedBlueprint),
  ]
    .filter(Boolean)
    .join('\n')

  const result = await structuredCall({
    model: DEFAULT_MODELS.ingestion_analysis,
    system: ANALYSIS_SYSTEM_PROMPT,
    user: userMsg,
    toolName: 'submit_analysis',
    inputSchema: ANALYSIS_SCHEMA,
    validator: AnalysisOutput,
    maxTokens: 2000,
  })

  return { ...result, prompt_version: process.env.PROMPT_VERSION ?? 'v1.1' }
}

export async function extractQueryFilters(query: string): Promise<StructuredCallResult<QueryFiltersT>> {
  return structuredCall({
    model: DEFAULT_MODELS.query_understanding,
    system: QUERY_UNDERSTANDING_SYSTEM,
    user: `User question: ${query}`,
    toolName: 'submit_filters',
    inputSchema: QUERY_UNDERSTANDING_SCHEMA,
    validator: QueryFiltersSchema,
    maxTokens: 500,
  })
}

export async function generateReuseVariant(args: {
  sourceBlueprint: unknown
  sourceAnalysis: unknown
  request: string
}): Promise<StructuredCallResult<ReuseOutputT>> {
  const userMsg = [
    `source_analysis: ${JSON.stringify(args.sourceAnalysis)}`,
    ``,
    `source_blueprint: ${JSON.stringify(args.sourceBlueprint)}`,
    ``,
    `user_request: ${args.request}`,
  ].join('\n')

  return structuredCall({
    model: DEFAULT_MODELS.reuse_generation,
    system: REUSE_SYSTEM_PROMPT,
    user: userMsg,
    toolName: 'submit_variant',
    inputSchema: REUSE_OUTPUT_SCHEMA,
    validator: ReuseOutput,
    maxTokens: 8000,
  })
}

/**
 * Streaming chat — used by /api/chat. Yields text deltas.
 * Returns an async iterable so the caller can stream to the client AND accumulate the full text
 * in parallel for storage.
 */
export async function* streamChat(args: {
  systemPrompt: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}): AsyncIterable<{ kind: 'delta'; text: string } | { kind: 'usage'; usage: UsageInfo }> {
  const model = DEFAULT_MODELS.chat_generation
  const stream = anthropic().messages.stream({
    model,
    max_tokens: args.maxTokens ?? 1024,
    system: args.systemPrompt,
    messages: args.history,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { kind: 'delta', text: event.delta.text }
    }
  }

  const final = await stream.finalMessage()
  yield {
    kind: 'usage',
    usage: {
      model,
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
      cost_usd: llmCostUsd(model, final.usage.input_tokens, final.usage.output_tokens),
    },
  }
}
