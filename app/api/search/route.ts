// POST /api/search — authenticated. Returns top-N matching scenarios.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, UnauthorizedResponse } from '@/lib/auth/require-session'
import { hybridSearch } from '@/lib/retrieval/hybrid-search'
import { logger } from '@/lib/utils/logger'

const Body = z.object({
  query: z.string().min(1).max(2000),
  filters: z
    .object({
      apps: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      trigger_types: z.array(z.enum(['polling', 'webhook', 'instant', 'scheduled'])).optional(),
      team_ids: z.array(z.string().uuid()).optional(),
      complexity: z.array(z.enum(['simple', 'medium', 'complex'])).optional(),
    })
    .optional(),
  limit: z.number().int().positive().max(50).optional(),
})

export async function POST(req: Request) {
  try {
    await requireUser()
  } catch (e) {
    if (e instanceof UnauthorizedResponse) return e.response
    throw e
  }

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }
  const { query, filters, limit = 10 } = parsed.data

  const t = Date.now()
  try {
    const results = await hybridSearch(query, { filters, limit })
    return NextResponse.json({
      query,
      results: results.map((r) => ({
        ...r,
        open_in_make_url: openInMakeUrl(r.make_scenario_id),
      })),
      took_ms: Date.now() - t,
    })
  } catch (err) {
    logger.error('search failed', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'search_failed' },
      { status: 500 },
    )
  }
}

function openInMakeUrl(makeScenarioId: string): string {
  const base = process.env.MAKE_WEB_BASE_URL ?? 'https://eu1.make.com'
  return `${base.replace(/\/$/, '')}/scenario/${makeScenarioId}/edit`
}
