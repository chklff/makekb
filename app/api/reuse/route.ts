// POST /api/reuse — authenticated.
// Generate a variant blueprint from a source scenario + a natural-language modification request.
//
// Body: { source_scenario_id: uuid; modification_request: string }
// Returns: { new_blueprint, change_summary[], warnings[], llm_model_used, estimated_cost_usd }

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser, UnauthorizedResponse } from '@/lib/auth/require-session'
import { createClient } from '@/lib/supabase/server'
import { generateReuseVariant } from '@/lib/llm/anthropic'
import { logger } from '@/lib/utils/logger'

export const maxDuration = 120

const Body = z.object({
  source_scenario_id: z.string().uuid(),
  modification_request: z.string().min(1).max(1000),
})

export async function POST(req: Request) {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    if (e instanceof UnauthorizedResponse) return e.response
    throw e
  }

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }
  const { source_scenario_id, modification_request } = parsed.data

  // Load the source row — RLS-scoped (user can only see their org's scenarios).
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('make_scenarios')
    .select('id, scenario_name, blueprint_json, llm_analysis_json, blueprint_storage_url')
    .eq('id', source_scenario_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'scenario_not_found' }, { status: 404 })
  // Cast through `unknown` — Supabase's generated row type intersects too narrowly here.
  const row = data as unknown as {
    id: string
    scenario_name: string
    blueprint_json: unknown
    llm_analysis_json: unknown
    blueprint_storage_url: string | null
  }

  // If the blueprint was offloaded to Storage (>500KB), bail with a friendly message.
  // v1 doesn't fetch from Storage here; that's a v1.5 thing.
  if (row.blueprint_storage_url && !row.blueprint_json) {
    return NextResponse.json(
      {
        error: 'blueprint_in_storage',
        message: 'This blueprint is too large for inline adaptation in v1. Open in Make to inspect.',
      },
      { status: 400 },
    )
  }

  if (!row.blueprint_json) {
    return NextResponse.json({ error: 'blueprint_missing' }, { status: 500 })
  }

  const t = Date.now()
  try {
    const result = await generateReuseVariant({
      sourceBlueprint: row.blueprint_json,
      sourceAnalysis: row.llm_analysis_json ?? {},
      request: modification_request,
    })

    logger.info('reuse generated', {
      user_id: user.id,
      source_scenario_id,
      duration_ms: Date.now() - t,
      cost_usd: result.usage.cost_usd,
    })

    return NextResponse.json({
      new_blueprint: result.output.new_blueprint,
      change_summary: result.output.change_summary,
      warnings: result.output.warnings,
      llm_model_used: result.usage.model,
      estimated_cost_usd: result.usage.cost_usd,
      duration_ms: Date.now() - t,
    })
  } catch (err) {
    logger.error('reuse failed', {
      user_id: user.id,
      source_scenario_id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'reuse_failed' },
      { status: 500 },
    )
  }
}
