// Pre-retrieval query understanding. Cheap Haiku call. Extracts structured
// filters from a free-text query so we can narrow the SQL candidate set
// before running vector + FTS scoring.

import { z } from 'zod'

export const QueryFiltersSchema = z.object({
  free_text: z.string(),
  filters: z.object({
    apps: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    trigger_types: z.array(z.enum(['polling', 'webhook', 'instant', 'scheduled'])).optional(),
    complexity: z.array(z.enum(['simple', 'medium', 'complex'])).optional(),
  }),
})

export type QueryFiltersT = z.infer<typeof QueryFiltersSchema>

export const QUERY_UNDERSTANDING_SYSTEM = `You extract structured filters from a free-text question
about a knowledge base of Make.com scenarios.

Return JSON matching the schema. Be conservative:
- Only include a filter if the user explicitly named it (e.g. "in HubSpot" → apps: ["hubspotcrm"]).
- Use canonical Make app keys (lowercase, hyphenated): hubspotcrm, facebook-conversion-leads,
  salesforce, pipedrive, slack, gmail, googlesheets, mailerlite, etc.
- If unclear, omit the filter rather than guessing.
- free_text should be the user's original query (or a lightly cleaned version) without the filter terms removed —
  the downstream vector search still benefits from the full sentence.`

export const QUERY_UNDERSTANDING_SCHEMA = {
  type: 'object',
  properties: {
    free_text: { type: 'string' },
    filters: {
      type: 'object',
      properties: {
        apps: { type: 'array', items: { type: 'string' } },
        categories: { type: 'array', items: { type: 'string' } },
        trigger_types: {
          type: 'array',
          items: { type: 'string', enum: ['polling', 'webhook', 'instant', 'scheduled'] },
        },
        complexity: {
          type: 'array',
          items: { type: 'string', enum: ['simple', 'medium', 'complex'] },
        },
      },
    },
  },
  required: ['free_text', 'filters'],
} as const
