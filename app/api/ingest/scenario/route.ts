// POST /api/ingest/scenario
// Admin-only. Runs the full ingest pipeline on ONE Make scenario.
//
// Body: { make_scenario_id: string; force?: boolean }
// Returns the RunResult from lib/ingest/run-scenario.ts.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminGuard } from '@/lib/auth/require-admin'
import { runScenarioIngestion } from '@/lib/ingest/run-scenario'

export const maxDuration = 60 // seconds — one Sonnet analysis fits comfortably

const Body = z.object({
  make_scenario_id: z.union([z.string().min(1), z.number()]).transform((v) => String(v)),
  force: z.boolean().optional(),
})

export async function POST(req: Request) {
  const guard = await adminGuard()
  if ('response' in guard) return guard.response

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const result = await runScenarioIngestion({
    scenarioId: parsed.data.make_scenario_id,
    force: parsed.data.force,
    trigger: 'manual',
  })

  const http = result.status === 'success' || result.status === 'skipped_hash_match' ? 200 : 500
  return NextResponse.json(result, { status: http })
}
