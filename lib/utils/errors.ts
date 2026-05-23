// Typed error classes for the ingestion + chat + reuse pipelines.
// Throwing the right class lets the worker decide whether to retry, alert, or move on.

export class AppError extends Error {
  readonly code: string
  readonly meta?: Record<string, unknown>
  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.meta = meta
  }
}

/** LLM returned bad data (invalid JSON despite structured output, missing required fields, etc.). */
export class LLMValidationError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('llm_validation', message, meta)
    this.name = 'LLMValidationError'
  }
}

/** LLM API returned 429 / 529 / overloaded. Retryable with backoff. */
export class LLMRateLimitError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('llm_rate_limit', message, meta)
    this.name = 'LLMRateLimitError'
  }
}

/** Daily budget exceeded — refuse to make the LLM call. Not retryable. */
export class BudgetExceededError extends AppError {
  constructor(kind: 'llm' | 'embedding', spentUsd: number, budgetUsd: number) {
    super('budget_exceeded', `${kind} daily budget exceeded: $${spentUsd.toFixed(2)} > $${budgetUsd.toFixed(2)}`, {
      kind,
      spent_usd: spentUsd,
      budget_usd: budgetUsd,
    })
    this.name = 'BudgetExceededError'
  }
}

/** Make API returned a non-2xx response. */
export class MakeAPIError extends AppError {
  readonly status: number
  constructor(status: number, message: string, meta?: Record<string, unknown>) {
    super('make_api', `Make API ${status}: ${message}`, meta)
    this.name = 'MakeAPIError'
    this.status = status
  }
}

/** Blueprint cleaner failed (malformed input, unexpected shape). */
export class BlueprintCleanError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('blueprint_clean', message, meta)
    this.name = 'BlueprintCleanError'
  }
}

/** Supabase upsert / RPC call failed. */
export class DbError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('db_error', message, meta)
    this.name = 'DbError'
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof LLMRateLimitError) return true
  if (err instanceof MakeAPIError && err.status >= 500) return true
  return false
}
