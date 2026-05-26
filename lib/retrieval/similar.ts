// Find scenarios similar to a given seed scenario via pgvector cosine distance.
//
// Used by:
//   - /scenarios/[id]      → "Similar scenarios" tile (top 5)
//   - /patterns/[seedId]   → full pattern member list

import '@/lib/utils/assert-server'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface SimilarRow {
  id: string
  make_scenario_id: string
  scenario_name: string
  one_line_summary: string | null
  category: string | null
  trigger_app: string | null
  apps_involved: string[]
  team_name: string | null
  is_synthetic: boolean
  similarity: number
}

export interface SimilarOptions {
  /** How many neighbors to return. Default 5. */
  limit?: number
  /** Minimum cosine similarity threshold (0..1). Default 0 — no filter. */
  minSimilarity?: number
  /** Include synthetic/demo rows in the candidate set. Default true. */
  includeSynthetic?: boolean
  /** Exclude the seed scenario from results. Default true. */
  excludeSelf?: boolean
}

interface RawRow {
  id: string
  make_scenario_id: string
  scenario_name: string
  one_line_summary: string | null
  category: string | null
  trigger_app: string | null
  apps_involved: unknown
  team_name: string | null
  is_synthetic: boolean
  embedding: string | null
}

function parseVector(s: string | null): Float32Array | null {
  if (!s) return null
  const trimmed = s.trim().replace(/^\[/, '').replace(/\]$/, '')
  if (!trimmed) return null
  const parts = trimmed.split(',')
  const out = new Float32Array(parts.length)
  for (let i = 0; i < parts.length; i++) out[i] = parseFloat(parts[i]!)
  return out
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}

/**
 * Fetch the seed's embedding, then compute similarity against the candidate set in JS.
 * In-JS scoring keeps the function dependency-free (no new SQL RPC) and is plenty fast at our
 * scale (≤1k rows). For larger orgs, port this to a pgvector RPC.
 */
export async function findSimilarToScenario(
  supabase: SupabaseServerClient,
  seedId: string,
  opts: SimilarOptions = {},
): Promise<SimilarRow[]> {
  const { limit = 5, minSimilarity = 0, includeSynthetic = true, excludeSelf = true } = opts

  // 1. Load seed embedding.
  const { data: seedData, error: seedErr } = await supabase
    .from('make_scenarios')
    .select('id, embedding')
    .eq('id', seedId)
    .maybeSingle()
  if (seedErr) throw new Error(`findSimilarToScenario: seed load failed: ${seedErr.message}`)
  const seed = seedData as unknown as { id: string; embedding: string | null } | null
  if (!seed || !seed.embedding) return []
  const seedVec = parseVector(seed.embedding)
  if (!seedVec) return []

  // 2. Load all candidate rows.
  const baseQuery = supabase
    .from('make_scenarios')
    .select(
      'id, make_scenario_id, scenario_name, one_line_summary, category, trigger_app, apps_involved, team_name, is_synthetic, embedding',
    )
    .not('embedding', 'is', null)
  const filtered = includeSynthetic ? baseQuery : baseQuery.eq('is_synthetic', false)
  const { data, error } = await filtered
  if (error) throw new Error(`findSimilarToScenario: candidates load failed: ${error.message}`)
  const candidates = (data ?? []) as unknown as RawRow[]

  // 3. Score + filter + sort + cap.
  const scored: SimilarRow[] = []
  for (const r of candidates) {
    if (excludeSelf && r.id === seedId) continue
    const v = parseVector(r.embedding)
    if (!v) continue
    const sim = cosine(seedVec, v)
    if (sim < minSimilarity) continue
    scored.push({
      id: r.id,
      make_scenario_id: r.make_scenario_id,
      scenario_name: r.scenario_name,
      one_line_summary: r.one_line_summary,
      category: r.category,
      trigger_app: r.trigger_app,
      apps_involved: Array.isArray(r.apps_involved) ? (r.apps_involved as string[]) : [],
      team_name: r.team_name,
      is_synthetic: r.is_synthetic,
      similarity: sim,
    })
  }
  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, limit)
}
