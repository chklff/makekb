// POST /api/ingest/embed-backfill
// Admin-only. Finds rows where LLM analysis succeeded but embedding is NULL,
// rebuilds the embedding input, and updates the row.
//
// Body: { batch_size?: number }   (default 20, max 100)

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminGuard } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { embed, buildEmbeddingInput } from '@/lib/llm/openai-embeddings'

export const maxDuration = 60

const Body = z.object({
  batch_size: z.number().int().positive().max(100).optional(),
})

export async function POST(req: Request) {
  const guard = await adminGuard()
  if ('response' in guard) return guard.response

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }
  const batchSize = parsed.data.batch_size ?? 20

  const supa = createServiceClient()
  const { data: rows, error } = await supa
    .from('make_scenarios')
    .select(
      'id, one_line_summary, business_purpose, full_description, data_flow, apps_involved, tags, use_cases, category, trigger_event, trigger_app, trigger_type',
    )
    .is('embedding', null)
    .not('full_description', 'is', null)
    .limit(batchSize)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ status: 'noop', count: 0 })
  }

  let succeeded = 0
  let failed = 0
  const failures: { id: string; error: string }[] = []

  for (const r of rows) {
    try {
      const result = await embed(
        buildEmbeddingInput({
          one_line_summary: r.one_line_summary ?? '',
          business_purpose: r.business_purpose ?? '',
          full_description: r.full_description ?? '',
          data_flow: r.data_flow ?? '',
          apps_involved: Array.isArray(r.apps_involved) ? (r.apps_involved as string[]) : [],
          tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
          use_cases: Array.isArray(r.use_cases) ? (r.use_cases as string[]) : [],
          category: r.category ?? '',
          trigger_event: r.trigger_event ?? '',
          trigger_app: r.trigger_app ?? '',
          trigger_type: r.trigger_type ?? '',
        }),
      )
      const { error: upErr } = await supa
        .from('make_scenarios')
        .update({ embedding: `[${result.vector.join(',')}]` })
        .eq('id', r.id)
      if (upErr) {
        failed++
        failures.push({ id: r.id, error: upErr.message })
      } else {
        succeeded++
      }
    } catch (err) {
      failed++
      failures.push({ id: r.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({
    status: failed === 0 ? 'success' : 'partial',
    total: rows.length,
    succeeded,
    failed,
    failures: failures.slice(0, 10),
  })
}
