// Hybrid retrieval. Calls the `search_scenarios` RPC which does:
//   1. SQL pre-filter (apps / categories / teams / complexity / trigger_type)
//   2. Vector cosine score on candidates
//   3. FTS rank on candidates
//   4. Weighted sum (0.7 vector + 0.3 fts)
// RPC is SECURITY INVOKER, so RLS scopes everything to the caller's org(s).

import '@/lib/utils/assert-server'
import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/llm/openai-embeddings'

export interface SearchFilters {
  apps?: string[]
  categories?: string[]
  trigger_types?: ('polling' | 'webhook' | 'instant' | 'scheduled')[]
  team_ids?: string[]
  complexity?: ('simple' | 'medium' | 'complex')[]
}

export interface SearchResult {
  id: string
  make_scenario_id: string
  scenario_name: string
  one_line_summary: string | null
  category: string | null
  trigger_type: string | null
  trigger_app: string | null
  apps_involved: string[]
  tags: string[]
  team_name: string | null
  complexity: 'simple' | 'medium' | 'complex' | null
  score: number
}

export interface HybridSearchOptions {
  filters?: SearchFilters
  limit?: number
  vectorWeight?: number
  /** Include synthetic/demo rows. Default false — chat + search never see them. */
  includeSynthetic?: boolean
}

export async function hybridSearch(
  query: string,
  opts: HybridSearchOptions = {},
): Promise<SearchResult[]> {
  const { filters = {}, limit = 10, vectorWeight = 0.7, includeSynthetic = false } = opts
  const supabase = await createClient()

  const { vector } = await embed(query)

  // Build args explicitly; omit optional ones when empty so Postgres uses DEFAULT NULL.
  const args: Record<string, unknown> = {
    p_query_embedding: `[${vector.join(',')}]`,
    p_query_text: query,
    p_match_count: limit,
    p_vector_weight: vectorWeight,
    p_include_synthetic: includeSynthetic,
  }
  if (filters.apps?.length) args.p_apps = filters.apps
  if (filters.categories?.length) args.p_categories = filters.categories
  if (filters.trigger_types?.length) args.p_trigger_types = filters.trigger_types
  if (filters.team_ids?.length) args.p_team_ids = filters.team_ids
  if (filters.complexity?.length) args.p_complexity = filters.complexity

  // The generated RPC arg type is overly strict; cast through unknown for the optional-arg pattern.
  const { data, error } = await supabase.rpc(
    'search_scenarios',
    args as unknown as Parameters<typeof supabase.rpc<'search_scenarios'>>[1],
  )

  if (error) throw new Error(`search_scenarios RPC failed: ${error.message}`)

  type Row = {
    id: string
    make_scenario_id: string
    scenario_name: string
    one_line_summary: string | null
    category: string | null
    trigger_type: string | null
    trigger_app: string | null
    apps_involved: unknown
    tags: unknown
    team_name: string | null
    complexity: string | null
    score: number | string
  }
  const rows = (data ?? []) as unknown as Row[]

  return rows.map((r) => ({
    id: r.id,
    make_scenario_id: r.make_scenario_id,
    scenario_name: r.scenario_name,
    one_line_summary: r.one_line_summary,
    category: r.category,
    trigger_type: r.trigger_type,
    trigger_app: r.trigger_app,
    apps_involved: Array.isArray(r.apps_involved) ? (r.apps_involved as string[]) : [],
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    team_name: r.team_name,
    complexity: (r.complexity ?? null) as SearchResult['complexity'],
    score: Number(r.score),
  }))
}
