#!/usr/bin/env -S tsx
/**
 * One-time backfill: crawl Make.com for the default org, ingest every scenario.
 *
 * Usage:
 *   pnpm ingest:backfill                  # all scenarios
 *   pnpm ingest:backfill --limit=20       # first 20 only
 *   pnpm ingest:backfill --concurrency=3  # cap parallelism
 *   pnpm ingest:backfill --team=12345     # one specific team
 *   pnpm ingest:backfill --folder=54321   # one specific folder (any team in the org)
 *   pnpm ingest:backfill --scenario=1234  # one scenario by Make id
 *
 * Reads env from .env.local. Calls lib/ingest/run-scenario directly via the service-role
 * Supabase client — no HTTP round-trip, no auth, no Vercel timeout to worry about.
 */
import './_load-env'
import { MakeClient } from '@/lib/make/client'
import { runScenarioIngestion } from '@/lib/ingest/run-scenario'

interface Args {
  limit?: number
  concurrency: number
  team?: number
  folder?: number
  scenario?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { concurrency: Number(process.env.INGEST_CONCURRENCY ?? 5) }
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/)
    if (!m) continue
    const [, k, v] = m
    if (k === 'limit') args.limit = parseInt(v!, 10)
    else if (k === 'concurrency') args.concurrency = parseInt(v!, 10)
    else if (k === 'team') args.team = parseInt(v!, 10)
    else if (k === 'folder') args.folder = parseInt(v!, 10)
    else if (k === 'scenario') args.scenario = v
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  const orgId = process.env.MAKE_DEFAULT_ORG_ID
  if (!orgId) throw new Error('MAKE_DEFAULT_ORG_ID is required in .env.local')

  // ── Single-scenario mode: skip the Make crawl, just ingest the one id.
  if (args.scenario) {
    console.info(`▶ Ingesting one scenario: ${args.scenario}`)
    const t = Date.now()
    const r = await runScenarioIngestion({
      scenarioId: args.scenario,
      trigger: 'manual',
      force: false,
    })
    const ms = Date.now() - t
    console.info()
    console.info(`▶ Result (${ms}ms):`)
    console.info(JSON.stringify(r, null, 2))
    if (r.status !== 'success' && r.status !== 'skipped_hash_match') process.exit(1)
    return
  }

  console.info(
    `▶ Backfill starting (org=${orgId}, concurrency=${args.concurrency}` +
      `${args.limit ? `, limit=${args.limit}` : ''}` +
      `${args.team ? `, team=${args.team}` : ''}` +
      `${args.folder ? `, folder=${args.folder}` : ''})`,
  )

  const make = new MakeClient()

  // If --folder is provided without --team, find which team owns it.
  let teams: { id: number }[]
  if (args.folder && !args.team) {
    const f = await make.findFolder(orgId, args.folder)
    if (!f) throw new Error(`Folder ${args.folder} not found in any team of org ${orgId}`)
    console.info(`  → folder ${args.folder} resolved to team ${f.teamId} ("${f.name}")`)
    teams = [{ id: f.teamId }]
  } else if (args.team) {
    teams = [{ id: args.team }]
  } else {
    teams = (await make.listTeams(orgId)).map((t) => ({ id: t.id }))
  }

  let scenarios: { id: number | string; teamId: number }[] = []
  for (const t of teams) {
    const scs = await make.listScenarios({ teamId: t.id, folderId: args.folder })
    for (const s of scs) scenarios.push({ id: s.id, teamId: t.id })
  }
  if (args.limit) scenarios = scenarios.slice(0, args.limit)

  console.info(
    `▶ Found ${scenarios.length} scenarios across ${teams.length} team(s)` +
      `${args.folder ? ` in folder ${args.folder}` : ''}.`,
  )

  let succeeded = 0
  let skipped = 0
  let failed = 0
  const failures: Array<{ id: string; status: string; error?: string }> = []
  const startedAt = Date.now()

  let cursor = 0
  async function worker(workerIdx: number) {
    while (true) {
      const i = cursor++
      if (i >= scenarios.length) return
      const s = scenarios[i]!
      const t = Date.now()
      try {
        const r = await runScenarioIngestion({ scenarioId: String(s.id), trigger: 'batch' })
        const ms = Date.now() - t
        if (r.status === 'success') {
          succeeded++
          console.info(
            `  [${i + 1}/${scenarios.length}] ✓ ${s.id} (${ms}ms, $${(r.llm_cost_usd ?? 0).toFixed(4)})`,
          )
        } else if (r.status === 'skipped_hash_match') {
          skipped++
          console.info(`  [${i + 1}/${scenarios.length}] ↷ ${s.id} skipped (hash unchanged)`)
        } else {
          failed++
          failures.push({ id: String(s.id), status: r.status, error: r.error })
          console.warn(`  [${i + 1}/${scenarios.length}] ✗ ${s.id} ${r.status}: ${r.error ?? ''}`)
        }
      } catch (err) {
        failed++
        const msg = err instanceof Error ? err.message : String(err)
        failures.push({ id: String(s.id), status: 'failed_insert', error: msg })
        console.error(`  [${i + 1}/${scenarios.length}] ✗ ${s.id} threw: ${msg}`)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(args.concurrency, scenarios.length) }, (_, i) => worker(i)),
  )

  const dur = Math.round((Date.now() - startedAt) / 1000)
  console.info()
  console.info(
    `▶ Done in ${dur}s — ${succeeded} success, ${skipped} skipped, ${failed} failed.`,
  )
  if (failed > 0) {
    console.info()
    console.info('Failures:')
    for (const f of failures.slice(0, 20)) {
      console.info(`  ${f.id}  ${f.status}  ${f.error ?? ''}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Backfill fatal:', err)
  process.exit(1)
})
