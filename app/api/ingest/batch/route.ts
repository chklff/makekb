// POST /api/ingest/batch
// Admin-only. Streams progress as NDJSON (one JSON object per line) so the UI
// can show a live progress bar. Each scenario completion emits one event.
//
// Body: { limit?: number; team_ids?: (string|number)[]; concurrency?: number }
//
// Stream events:
//   { type: 'start', total: number }
//   { type: 'progress', done: number, total: number, scenario_id, status, error? }
//   { type: 'done', summary: { total, success, skipped_hash_match, failed, duration_ms, failures } }
//   { type: 'error', error: string }            // fatal; stream closes after this

import { z } from 'zod'
import { adminGuard } from '@/lib/auth/require-admin'
import { MakeClient } from '@/lib/make/client'
import { runScenarioIngestion } from '@/lib/ingest/run-scenario'
import { logger } from '@/lib/utils/logger'

export const maxDuration = 300 // 5 minutes (Vercel Pro)

const Body = z.object({
  limit: z.number().int().positive().max(200).optional(),
  team_ids: z.array(z.union([z.string(), z.number()])).optional(),
  folder_id: z.union([z.string(), z.number()]).optional(),
  concurrency: z.number().int().positive().max(10).optional(),
})

interface ItemResult {
  scenario_id: string
  status: string
  error?: string
}

export async function POST(req: Request) {
  const guard = await adminGuard()
  if ('response' in guard) return guard.response

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return ndjsonError({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const {
    limit,
    team_ids,
    folder_id,
    concurrency = Number(process.env.INGEST_CONCURRENCY ?? 5),
  } = parsed.data

  const orgId = process.env.MAKE_DEFAULT_ORG_ID
  if (!orgId) return ndjsonError({ error: 'MAKE_DEFAULT_ORG_ID not configured' }, 500)

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      const startedAtMs = Date.now()
      const make = new MakeClient()

      // 1. Discover scenarios (this is the only step that runs before we know the total)
      let allScenarios: { id: number | string; teamId: number }[] = []
      try {
        // If folder_id is provided without team_ids, resolve which team owns it.
        let teams: { id: number }[]
        if (folder_id && !team_ids?.length) {
          const f = await make.findFolder(orgId, folder_id)
          if (!f) {
            emit({ type: 'error', error: `Folder ${folder_id} not found in org ${orgId}` })
            controller.close()
            return
          }
          teams = [{ id: f.teamId }]
        } else if (team_ids?.length) {
          teams = team_ids.map((tid) => ({ id: Number(tid) }))
        } else {
          teams = (await make.listTeams(orgId)).map((t) => ({ id: t.id }))
        }
        for (const t of teams) {
          const scs = await make.listScenarios({ teamId: t.id, folderId: folder_id })
          for (const s of scs) allScenarios.push({ id: s.id, teamId: t.id })
        }
      } catch (err) {
        emit({ type: 'error', error: err instanceof Error ? err.message : String(err) })
        controller.close()
        return
      }
      if (limit && allScenarios.length > limit) allScenarios = allScenarios.slice(0, limit)

      emit({ type: 'start', total: allScenarios.length })

      if (allScenarios.length === 0) {
        emit({
          type: 'done',
          summary: { total: 0, success: 0, skipped_hash_match: 0, failed: 0, duration_ms: 0, failures: [] },
        })
        controller.close()
        return
      }

      // 2. Ingest with concurrency cap, emitting progress per item
      const results: ItemResult[] = []
      let cursor = 0
      let done = 0

      async function worker() {
        while (true) {
          const i = cursor++
          if (i >= allScenarios.length) return
          const s = allScenarios[i]!
          try {
            const r = await runScenarioIngestion({ scenarioId: String(s.id), trigger: 'batch' })
            const item: ItemResult = { scenario_id: String(s.id), status: r.status, error: r.error }
            results.push(item)
            done++
            emit({
              type: 'progress',
              done,
              total: allScenarios.length,
              scenario_id: item.scenario_id,
              status: item.status,
              error: item.error,
            })
          } catch (err) {
            const item: ItemResult = {
              scenario_id: String(s.id),
              status: 'failed_insert',
              error: err instanceof Error ? err.message : String(err),
            }
            results.push(item)
            done++
            logger.error('Batch item threw', { scenario_id: s.id, error: item.error })
            emit({
              type: 'progress',
              done,
              total: allScenarios.length,
              scenario_id: item.scenario_id,
              status: item.status,
              error: item.error,
            })
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(concurrency, allScenarios.length) }, () => worker()),
      )

      // 3. Final summary
      emit({
        type: 'done',
        summary: {
          total: results.length,
          success: results.filter((r) => r.status === 'success').length,
          skipped_hash_match: results.filter((r) => r.status === 'skipped_hash_match').length,
          failed: results.filter((r) => r.status.startsWith('failed')).length,
          duration_ms: Date.now() - startedAtMs,
          failures: results.filter((r) => r.status.startsWith('failed')).slice(0, 20),
        },
      })
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no', // disable proxy buffering
    },
  })
}

function ndjsonError(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body) + '\n', {
    status,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
  })
}
