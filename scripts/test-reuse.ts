#!/usr/bin/env -S tsx
/**
 * Smoke test for the Sonnet 4.5 reuse pipeline. Runs against any scenario id
 * by calling the same `generateReuseVariant` the API route uses.
 *
 *   pnpm tsx scripts/test-reuse.ts <scenario_uuid> "<modification request>"
 */
import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { generateReuseVariant } from '@/lib/llm/anthropic'

async function main() {
  const [scenarioId, ...rest] = process.argv.slice(2)
  const request = rest.join(' ').trim()
  if (!scenarioId || !request) {
    console.error('usage: pnpm tsx scripts/test-reuse.ts <scenario_uuid> "<modification>"')
    process.exit(1)
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: row, error } = await supa
    .from('make_scenarios')
    .select('scenario_name, blueprint_json, llm_analysis_json')
    .eq('id', scenarioId)
    .single()
  if (error || !row) {
    console.error('Scenario not found:', error?.message)
    process.exit(1)
  }
  console.info(`▶ Loaded "${row.scenario_name}"`)

  const t = Date.now()
  const result = await generateReuseVariant({
    sourceBlueprint: row.blueprint_json,
    sourceAnalysis: row.llm_analysis_json ?? {},
    request,
  })

  console.info(`▶ Generated in ${Date.now() - t}ms (cost $${result.usage.cost_usd.toFixed(4)})`)
  console.info()
  console.info('Changes:')
  for (const c of result.output.change_summary) console.info('  -', c)
  console.info()
  if (result.output.warnings.length > 0) {
    console.info('Warnings:')
    for (const w of result.output.warnings) console.info('  !', w)
    console.info()
  }
  console.info('Blueprint preview (first 800 chars):')
  console.info(JSON.stringify(result.output.new_blueprint).slice(0, 800), '…')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
