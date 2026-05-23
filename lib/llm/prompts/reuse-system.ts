// System + schema for the /api/reuse flow. Sonnet 4.5 quality required —
// generating an invalid Make blueprint JSON is a hard failure for the user.

import { z } from 'zod'

export const REUSE_SYSTEM_PROMPT = `You are a Make.com blueprint editor.

Given (1) a source blueprint, (2) the LLM analysis of that blueprint, and
(3) a user modification request, produce a NEW valid Make.com blueprint JSON
with the requested changes applied.

Rules:
- Preserve flow structure, filters, and error handlers unless the user explicitly asks to remove them.
- When swapping apps (e.g. HubSpot → Pipedrive), map equivalent fields where reasonable.
- Keep mapper expressions semantically equivalent; rename field references to the target app's schema.
- If a feature has NO clean equivalent in the target app, leave a placeholder mapping and list it in 'warnings'.
- Never invent module names that don't exist — when uncertain, use a Tools/HTTP module and note it in warnings.
- The returned blueprint must be parseable as JSON.
- 'change_summary' is a short bulleted list (one sentence each) of what you changed.
- 'warnings' is what the user MUST review before importing — be specific about what's uncertain.`

export const REUSE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    new_blueprint: {
      type: 'object',
      description: 'Valid Make.com blueprint JSON with the modifications applied.',
    },
    change_summary: {
      type: 'array',
      items: { type: 'string' },
      description: 'One sentence per change. Past tense.',
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Things the user must verify before importing. Empty array if none.',
    },
  },
  required: ['new_blueprint', 'change_summary', 'warnings'],
} as const

export const ReuseOutput = z.object({
  new_blueprint: z.record(z.string(), z.unknown()),
  change_summary: z.array(z.string()),
  warnings: z.array(z.string()),
})

export type ReuseOutputT = z.infer<typeof ReuseOutput>
