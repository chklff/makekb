import Link from 'next/link'
import { Users, LayoutGrid, Zap, ExternalLink, Layers2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { hybridSearch } from '@/lib/retrieval/hybrid-search'
import type { Json } from '@/lib/supabase/types'
import { FilterBar, type FilterFacets } from './filter-bar'

export const dynamic = 'force-dynamic'

interface BrowseRow {
  id: string
  make_scenario_id: string
  scenario_name: string
  one_line_summary: string | null
  category: string | null
  trigger_type: string | null
  trigger_app: string | null
  complexity: string | null
  apps_involved: Json | null
  team_name: string | null
  analyzed_at: string | null
  score?: number
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const appsFilter = arr(sp.app)
  const categoriesFilter = arr(sp.category)
  const teamsFilter = arr(sp.team)
  const complexityFilter = arr(sp.complexity) as ('simple' | 'medium' | 'complex')[]
  const minMatchPct = Math.max(0, Math.min(100, Number(sp.min_match ?? 0) || 0))
  const minMatch = minMatchPct / 100

  const supabase = await createClient()

  // 1. Always fetch the full org list once — used for facet counts.
  //    At our scale (≤500 scenarios) this is fine to do every browse render.
  const { data: allRaw, error: allErr } = await supabase
    .from('make_scenarios')
    .select(
      'id, make_scenario_id, scenario_name, one_line_summary, category, trigger_type, trigger_app, complexity, apps_involved, team_name, analyzed_at',
    )
    .order('analyzed_at', { ascending: false })
    .returns<BrowseRow[]>()

  if (allErr) return <ErrorState message={allErr.message} />
  const all = allRaw ?? []

  // 2. Compute facets from the full list — counts reflect total, not filtered.
  //    (Counts of "what's available" don't shrink as you filter — keeps UI predictable.)
  const facets: FilterFacets = buildFacets(all)

  // 3. Build the result set.
  //    - If `q` is set → vector + FTS via /search RPC, then apply chip filters client-side.
  //    - Otherwise → filter `all` by chips in-memory (no extra LLM call).
  let rows: BrowseRow[] = all
  let searchMode = false
  let searchError: string | null = null

  if (q) {
    searchMode = true
    try {
      // hybridSearch only supports a subset of filters at the SQL pre-filter level;
      // we still post-filter team_ids here since the RPC filter expects UUIDs we don't have.
      const searchRes = await hybridSearch(q, {
        filters: {
          apps: appsFilter.length ? appsFilter : undefined,
          categories: categoriesFilter.length ? categoriesFilter : undefined,
          complexity: complexityFilter.length ? complexityFilter : undefined,
        },
        limit: 50,
      })
      // Look up team_name etc. from the `all` map so we can render the same card shape.
      const byId = new Map(all.map((r) => [r.id, r]))
      rows = searchRes
        .map((s) => {
          const base = byId.get(s.id)
          if (!base) return null
          return { ...base, score: s.score }
        })
        .filter((x): x is BrowseRow & { score: number } => x !== null)
    } catch (err) {
      searchError = err instanceof Error ? err.message : String(err)
      rows = []
    }
  }

  // 4. Apply chip filters that haven't already been applied at SQL level.
  if (teamsFilter.length) {
    rows = rows.filter((r) => r.team_name && teamsFilter.includes(r.team_name))
  }
  if (searchMode && minMatch > 0) {
    rows = rows.filter((r) => (r.score ?? 0) >= minMatch)
  }
  if (!q) {
    // Only when not searching — search route already applied apps/category/complexity.
    if (appsFilter.length)
      rows = rows.filter(
        (r) =>
          Array.isArray(r.apps_involved) &&
          appsFilter.some((a) => (r.apps_involved as string[]).includes(a)),
      )
    if (categoriesFilter.length) rows = rows.filter((r) => r.category && categoriesFilter.includes(r.category))
    if (complexityFilter.length) rows = rows.filter((r) => r.complexity && complexityFilter.includes(r.complexity as never))
  }

  const totalScenarios = all.length
  const totalTeams = new Set(all.map((r) => r.team_name).filter(Boolean)).size
  const totalApps = new Set(
    all.flatMap((r) => (Array.isArray(r.apps_involved) ? (r.apps_involved as string[]) : [])),
  ).size

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tighter">Browse scenarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalScenarios} scenario{totalScenarios === 1 ? '' : 's'} indexed
          {searchMode && (
            <>
              <span className="mx-2 text-muted-foreground/40">·</span>
              <span>
                {rows.length} match{rows.length === 1 ? '' : 'es'} for &ldquo;{q}&rdquo;
              </span>
            </>
          )}
        </p>
      </header>

      <FilterBar facets={facets} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={searchMode ? 'Matches' : 'Scenarios'} value={searchMode ? rows.length : totalScenarios} icon={<LayoutGrid className="size-4" />} />
        <Stat label="Patterns" value={0} icon={<Layers2 className="size-4" />} />
        <Stat label="Apps" value={totalApps} icon={<Zap className="size-4" />} />
        <Stat label="Teams" value={totalTeams} icon={<Users className="size-4" />} />
      </div>

      {/* List */}
      {searchError ? (
        <Card className="border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.06)] p-6">
          <p className="text-sm text-[hsl(var(--danger))]">Search failed: {searchError}</p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState searching={Boolean(q)} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <ScenarioRow
              key={r.id}
              id={r.id}
              name={r.scenario_name}
              summary={r.one_line_summary ?? ''}
              category={r.category ?? ''}
              complexity={r.complexity ?? ''}
              triggerType={r.trigger_type ?? ''}
              triggerApp={r.trigger_app ?? ''}
              apps={Array.isArray(r.apps_involved) ? (r.apps_involved as string[]) : []}
              team={r.team_name ?? null}
              score={r.score}
            />
          ))}
        </ul>
      )}

      {/* Patterns deferred */}
      <Card className="border-[hsl(var(--make-purple)/0.12)] bg-[hsl(var(--make-purple)/0.04)] p-4">
        <div className="flex items-center gap-2 text-sm">
          <Layers2 className="size-4 text-[hsl(var(--make-purple))]" />
          <span className="font-medium">Pattern clustering — coming in v1.5</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Once 100+ scenarios are ingested, similar ones will be grouped into reusable patterns.
        </p>
      </Card>
    </div>
  )
}

function arr(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function buildFacets(all: BrowseRow[]): FilterFacets {
  const apps = new Map<string, number>()
  const categories = new Map<string, number>()
  const teams = new Map<string, number>()
  const complexity = new Map<string, number>()
  for (const r of all) {
    if (Array.isArray(r.apps_involved)) {
      for (const a of r.apps_involved as string[]) apps.set(a, (apps.get(a) ?? 0) + 1)
    }
    if (r.category) categories.set(r.category, (categories.get(r.category) ?? 0) + 1)
    if (r.team_name) teams.set(r.team_name, (teams.get(r.team_name) ?? 0) + 1)
    if (r.complexity) complexity.set(r.complexity, (complexity.get(r.complexity) ?? 0) + 1)
  }
  function toSorted(m: Map<string, number>) {
    return Array.from(m, ([value, count]) => ({ value, count })).sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value),
    )
  }
  return {
    apps: toSorted(apps),
    categories: toSorted(categories),
    teams: toSorted(teams),
    complexity: toSorted(complexity),
  }
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--make-purple)/0.08)] text-[hsl(var(--make-purple))]">
        {icon}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tightish">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  )
}

function ScenarioRow({
  id,
  name,
  summary,
  category,
  complexity,
  triggerType,
  triggerApp,
  apps,
  team,
  score,
}: {
  id: string
  name: string
  summary: string
  category: string
  complexity: string
  triggerType: string
  triggerApp: string
  apps: string[]
  team: string | null
  score?: number
}) {
  return (
    <li>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium tracking-tightish">{name}</h3>
              {score !== undefined && (
                <span className="rounded-full bg-[hsl(var(--make-purple)/0.1)] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--make-purple))]">
                  {Math.round(score * 100)}% match
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {category && <Badge variant="secondary">{category}</Badge>}
              {complexity && <Badge variant="outline">{complexity}</Badge>}
              {triggerType && (
                <Badge variant="secondary" className="text-[11px]">
                  {triggerType} · {triggerApp}
                </Badge>
              )}
              {team && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="size-3" />
                  {team}
                </span>
              )}
            </div>
            {apps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* Dedupe — the LLM analysis schema asks for unique apps but doesn't
                    always comply. React rejects duplicate keys. */}
                {Array.from(new Set(apps)).slice(0, 6).map((a) => (
                  <span
                    key={a}
                    className="rounded bg-[hsl(var(--make-purple)/0.08)] px-1.5 py-0.5 font-mono text-[11px] text-[hsl(var(--make-purple))]"
                  >
                    {a}
                  </span>
                ))}
                {apps.length > 6 && (
                  <span className="text-[11px] text-muted-foreground">+{apps.length - 6}</span>
                )}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/scenarios/${id}`}>
              <ExternalLink className="size-3.5" />
              Open
            </Link>
          </Button>
        </div>
      </Card>
    </li>
  )
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <Card className="p-8 text-center">
      <Sparkles className="mx-auto mb-3 size-6 text-[hsl(var(--make-purple))]" />
      <h2 className="text-base font-medium tracking-tightish">
        {searching ? 'No scenarios match your filters' : 'No scenarios ingested yet'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {searching
          ? 'Try clearing some filters, or rephrasing your search.'
          : 'Click Re-sync (top bar) or run pnpm ingest:backfill to pull scenarios from Make.'}
      </p>
    </Card>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.06)] p-6">
      <h2 className="text-base font-medium tracking-tightish text-[hsl(var(--danger))]">
        Couldn&apos;t load scenarios
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </Card>
  )
}
