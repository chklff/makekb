#!/usr/bin/env -S tsx
/**
 * Quick CLI smoke test for the hybrid retrieval pipeline.
 *
 * Usage:
 *   pnpm tsx scripts/test-search.ts "do we have a hubspot scenario?"
 *
 * Bypasses RLS (uses service-role client) so it can run without auth.
 * Useful only for verifying the RPC + embeddings work end-to-end.
 */
import './_load-env'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

async function main() {
  const query = process.argv.slice(2).join(' ').trim()
  if (!query) {
    console.error('usage: pnpm tsx scripts/test-search.ts "<query>"')
    process.exit(1)
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const t0 = Date.now()
  const emb = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: query,
  })
  const vec = emb.data[0]!.embedding
  console.info(`▶ embedded in ${Date.now() - t0}ms (${vec.length} dims)`)

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const t1 = Date.now()
  const { data, error } = await supa.rpc('search_scenarios', {
    p_query_embedding: `[${vec.join(',')}]`,
    p_query_text: query,
    p_match_count: 5,
    p_vector_weight: 0.7,
  })
  if (error) {
    console.error('RPC failed:', error)
    process.exit(1)
  }
  console.info(`▶ RPC returned ${data?.length ?? 0} rows in ${Date.now() - t1}ms`)
  console.info()
  for (const r of data ?? []) {
    console.info(`  [${Number(r.score).toFixed(3)}] ${r.scenario_name}`)
    console.info(`    ${r.one_line_summary}`)
    console.info(`    apps=${JSON.stringify(r.apps_involved)} category=${r.category} complexity=${r.complexity}`)
    console.info()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
