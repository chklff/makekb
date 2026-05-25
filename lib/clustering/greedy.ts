// Greedy nearest-neighbor clustering for scenario patterns.
//
// Algorithm:
//   1. Sort scenarios by embedding presence (skip nulls).
//   2. Pick the first ungrouped scenario as a cluster seed.
//   3. Find all ungrouped scenarios with cosine similarity >= threshold.
//   4. That group is a cluster; mark them all as grouped.
//   5. Repeat until no ungrouped scenarios remain.
//
// Why greedy instead of k-means / HDBSCAN?
//   - No need to pick k upfront — clusters emerge from a single similarity threshold
//   - Deterministic — same inputs always produce same clusters
//   - Cheap to run server-side every request (we cache for 5 min on top)
//   - Easy to tune: lower threshold → fewer, bigger clusters; higher → more, tighter
//
// At our scale (≤1k scenarios) this is ~1-2s of CPU. We do the heavy lifting in SQL
// — pgvector's HNSW index makes each "find neighbors" query fast.

import '@/lib/utils/assert-server'
import type { createClient } from '@/lib/supabase/server'

// Match the actual return type of createClient so callers can pass it straight through.
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface ClusterMember {
  id: string
  make_scenario_id: string
  scenario_name: string
  one_line_summary: string | null
  category: string | null
  trigger_app: string | null
  apps_involved: string[]
  team_name: string | null
  is_synthetic: boolean
  similarity_to_seed: number // 1.0 for the seed itself
}

export interface Pattern {
  /** Index of this cluster (1-based, for display). */
  index: number
  /** The seed scenario whose embedding the others matched against. */
  seed: ClusterMember
  /** All scenarios in this cluster, including the seed. Sorted by descending similarity. */
  members: ClusterMember[]
  /** Distinct trigger apps across members (e.g. ['hubspotcrm','salesforce','pipedrive']). */
  trigger_apps: string[]
  /** Categories represented (usually just one). */
  categories: string[]
  /** Whether the cluster mixes synthetic + real or is pure. */
  mix: 'real-only' | 'synthetic-only' | 'mixed'
}

export interface ClusterOptions {
  /** Cosine similarity ≥ this groups two scenarios. 0.85 = "same pattern". */
  threshold?: number
  /** Drop clusters smaller than this. Singletons (size 1) are not really patterns. */
  minMembers?: number
  /** Include synthetic rows. Default true (the /patterns page is meant to surface them). */
  includeSynthetic?: boolean
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
  // pgvector returns vectors as JSON-stringified text like "[0.1,0.2,...]" via the SDK.
  embedding: string | null
}

function parseVector(s: string | null): Float32Array | null {
  if (!s) return null
  // Postgres returns "[0.1,0.2,...]". Trim brackets, split on comma, parse floats.
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
    const x = a[i]!
    const y = b[i]!
    dot += x * y
    na += x * x
    nb += y * y
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Compute clusters over the user's RLS-scoped scenarios.
 * Returns clusters sorted by member count (largest patterns first).
 */
export async function computePatterns(
  supabase: SupabaseServerClient,
  opts: ClusterOptions = {},
): Promise<Pattern[]> {
  const { threshold = 0.85, minMembers = 2, includeSynthetic = true } = opts

  // 1. Load all RLS-scoped rows that have an embedding.
  const baseQuery = supabase
    .from('make_scenarios')
    .select(
      'id, make_scenario_id, scenario_name, one_line_summary, category, trigger_app, apps_involved, team_name, is_synthetic, embedding',
    )
    .not('embedding', 'is', null)
  const filtered = includeSynthetic ? baseQuery : baseQuery.eq('is_synthetic', false)
  const { data, error } = await filtered
  if (error) throw new Error(`computePatterns: load failed: ${error.message}`)
  const rawRows = (data ?? []) as unknown as RawRow[]

  // 2. Parse embeddings.
  type Row = Omit<RawRow, 'embedding' | 'apps_involved'> & {
    vec: Float32Array
    apps_involved: string[]
  }
  const rows: Row[] = []
  for (const r of rawRows) {
    const vec = parseVector(r.embedding)
    if (!vec) continue
    rows.push({
      id: r.id,
      make_scenario_id: r.make_scenario_id,
      scenario_name: r.scenario_name,
      one_line_summary: r.one_line_summary,
      category: r.category,
      trigger_app: r.trigger_app,
      apps_involved: Array.isArray(r.apps_involved) ? (r.apps_involved as string[]) : [],
      team_name: r.team_name,
      is_synthetic: r.is_synthetic,
      vec,
    })
  }

  // 3. Greedy clustering.
  const used = new Set<string>()
  const patterns: Pattern[] = []
  let idx = 1
  for (const seed of rows) {
    if (used.has(seed.id)) continue
    used.add(seed.id)
    const members: ClusterMember[] = [
      {
        id: seed.id,
        make_scenario_id: seed.make_scenario_id,
        scenario_name: seed.scenario_name,
        one_line_summary: seed.one_line_summary,
        category: seed.category,
        trigger_app: seed.trigger_app,
        apps_involved: seed.apps_involved,
        team_name: seed.team_name,
        is_synthetic: seed.is_synthetic,
        similarity_to_seed: 1.0,
      },
    ]
    for (const other of rows) {
      if (used.has(other.id)) continue
      const sim = cosine(seed.vec, other.vec)
      if (sim >= threshold) {
        used.add(other.id)
        members.push({
          id: other.id,
          make_scenario_id: other.make_scenario_id,
          scenario_name: other.scenario_name,
          one_line_summary: other.one_line_summary,
          category: other.category,
          trigger_app: other.trigger_app,
          apps_involved: other.apps_involved,
          team_name: other.team_name,
          is_synthetic: other.is_synthetic,
          similarity_to_seed: sim,
        })
      }
    }
    if (members.length < minMembers) continue

    members.sort((a, b) => b.similarity_to_seed - a.similarity_to_seed)
    const trigger_apps = Array.from(new Set(members.map((m) => m.trigger_app).filter(Boolean) as string[]))
    const categories = Array.from(new Set(members.map((m) => m.category).filter(Boolean) as string[]))
    const hasReal = members.some((m) => !m.is_synthetic)
    const hasSynth = members.some((m) => m.is_synthetic)
    const mix: Pattern['mix'] = hasReal && hasSynth ? 'mixed' : hasReal ? 'real-only' : 'synthetic-only'

    patterns.push({
      index: idx++,
      seed: members[0]!,
      members,
      trigger_apps,
      categories,
      mix,
    })
  }

  // 4. Sort biggest first.
  patterns.sort((a, b) => b.members.length - a.members.length)
  return patterns
}
