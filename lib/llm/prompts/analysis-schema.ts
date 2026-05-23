// JSON schema fed to Anthropic via tool-use for structured-output guarantees.
// Mirrors the schema in /docs/archive/AI-Architecture.md §4.2 / /docs/archive/Build-Brief.md §7.

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    one_line_summary: { type: 'string' },
    business_purpose: { type: 'string' },
    full_description: { type: 'string' },
    data_flow: { type: 'string' },
    branches: {
      type: 'array',
      description: 'Every router or filter condition. Empty array [] if none.',
      items: {
        type: 'object',
        properties: {
          condition: { type: 'string' },
          path_true: { type: 'string' },
          path_false: { type: 'string' },
        },
        required: ['condition', 'path_true', 'path_false'],
      },
    },
    error_handling: {
      type: 'string',
      description:
        "Every onerror handler: which module, type (Resume/Rollback/Ignore/Commit/Break), and impact. 'No error handlers configured' if none.",
    },
    apps_involved: {
      type: 'array',
      description: "App keys only, extracted before the colon. Exclude 'builtin'. No duplicates.",
      items: { type: 'string' },
    },
    use_cases: {
      type: 'array',
      items: { type: 'string' },
      description: '2-4 short business use case labels.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '5-8 lowercase search tags. Include app names, object types, actions.',
    },
    category: {
      type: 'string',
      description:
        'Pick one: Ad Tracking / CRM Sync / Lead Management / Notifications / E-commerce / Data Enrichment / Ops / Reporting / Internal Tools / Customer Success.',
    },
    trigger_type: {
      type: 'string',
      enum: ['polling', 'webhook', 'instant', 'scheduled'],
      description:
        'polling = scheduled poll for new/updated records. webhook = external push. instant = Make-native instant trigger. scheduled = pure time-based, no data source.',
    },
    trigger_app: { type: 'string', description: 'App key of the FIRST module only.' },
    trigger_event: { type: 'string', description: "Human-readable event name, e.g. 'Deal Updated'." },
    complexity: {
      type: 'string',
      enum: ['simple', 'medium', 'complex'],
      description:
        'simple = linear, 1-3 modules. medium = 4-8 modules or some branching. complex = 9+ modules or multiple routers/error paths.',
    },
    reuse_notes: {
      type: 'string',
      description:
        'Concrete and specific: which connections need replacing, which IDs are hardcoded, which mappings are account-specific. No generic advice.',
    },
  },
  required: [
    'one_line_summary',
    'business_purpose',
    'full_description',
    'data_flow',
    'branches',
    'error_handling',
    'apps_involved',
    'use_cases',
    'tags',
    'category',
    'trigger_type',
    'trigger_app',
    'trigger_event',
    'complexity',
    'reuse_notes',
  ],
} as const

// Zod mirror — used to validate the LLM's tool input after the call returns.
// Kept in lockstep with the JSON Schema above; if you change one, change the other.
import { z } from 'zod'

export const AnalysisOutput = z.object({
  one_line_summary: z.string().min(1),
  business_purpose: z.string().min(1),
  full_description: z.string().min(1),
  data_flow: z.string().min(1),
  branches: z.array(
    z.object({
      condition: z.string(),
      path_true: z.string(),
      path_false: z.string(),
    }),
  ),
  error_handling: z.string().min(1),
  apps_involved: z.array(z.string()),
  use_cases: z.array(z.string()),
  tags: z.array(z.string()),
  category: z.string().min(1),
  trigger_type: z.enum(['polling', 'webhook', 'instant', 'scheduled']),
  trigger_app: z.string().min(1),
  trigger_event: z.string().min(1),
  complexity: z.enum(['simple', 'medium', 'complex']),
  reuse_notes: z.string().min(1),
})

export type AnalysisOutputT = z.infer<typeof AnalysisOutput>
