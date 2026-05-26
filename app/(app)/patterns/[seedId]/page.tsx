// /patterns/[seedId] — full member list for one pattern.
//
// "Pattern" here is defined relative to a seed scenario: all scenarios within a
// cosine threshold of the seed's embedding. The URL is stable because it's tied
// to the seed's UUID, not an ephemeral cluster index.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Layers2, Sparkles, Zap, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { findSimilarToScenario } from '@/lib/retrieval/similar'
import { openInMakeUrl } from '@/lib/utils/make-url'
import type { Tables } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

type Scenario = Tables<'make_scenarios'>

export default async function PatternDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ seedId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { seedId } = await params
  const sp = await searchParams
  const threshold = Math.max(0.5, Math.min(0.99, Number(sp.threshold ?? 0.85) || 0.85))

  const supabase = await createClient()

  // Seed lookup — RLS will return null for scenarios outside the user's org.
  const { data: seedData } = await supabase
    .from('make_scenarios')
    .select('*')
    .eq('id', seedId)
    .maybeSingle<Scenario>()
  if (!seedData) notFound()
  const seed = seedData

  // All members within threshold of the seed. Include self so we always have ≥1.
  const members = await findSimilarToScenario(supabase, seed.id, {
    limit: 100,
    minSimilarity: threshold,
    excludeSelf: false,
  })
  // Move seed to position 0 if it isn't already (findSimilar excludeSelf=false guarantees it).
  members.sort((a, b) => (a.id === seed.id ? -1 : b.id === seed.id ? 1 : b.similarity - a.similarity))

  const triggerApps = Array.from(new Set(members.map((m) => m.trigger_app).filter(Boolean) as string[]))
  const categories = Array.from(new Set(members.map((m) => m.category).filter(Boolean) as string[]))
  const realCount = members.filter((m) => !m.is_synthetic).length
  const synthCount = members.length - realCount

  return (
    <main className="space-y-6">
      <Link
        href="/patterns"
        className="ring-make-focus inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-[hsl(var(--make-purple))]"
      >
        <ArrowLeft className="size-3" />
        All patterns
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers2 className="size-5 text-[hsl(var(--make-purple))]" />
          <h1 className="text-2xl font-semibold leading-tight tracking-tighter">
            {seed.one_line_summary ?? seed.scenario_name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{members.length} scenarios</Badge>
          {categories.map((c) => (
            <Badge key={c} variant="outline">
              {c}
            </Badge>
          ))}
          <span className="text-muted-foreground">
            {realCount} real · {synthCount} demo
          </span>
        </div>
        {triggerApps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <Zap className="size-3" />
            <span>Trigger apps:</span>
            {triggerApps.map((a) => (
              <span
                key={a}
                className="rounded bg-[hsl(var(--make-purple)/0.06)] px-1.5 py-0.5 font-mono text-[10px] text-foreground"
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        {/* LEFT: members list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">All variants in this pattern</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {members.map((m) => (
              <Link
                key={m.id}
                href={`/scenarios/${m.id}`}
                className="ring-make-focus group flex items-start gap-3 rounded-md border border-transparent p-3 hover:border-[hsl(var(--make-purple)/0.16)] hover:bg-[hsl(var(--make-purple)/0.04)]"
              >
                <span className="mt-0.5 shrink-0 rounded bg-[hsl(var(--make-purple)/0.08)] px-1.5 py-0.5 font-mono text-[10px] text-[hsl(var(--make-purple))]">
                  {Math.round(m.similarity * 100)}%
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium text-foreground group-hover:text-[hsl(var(--make-purple))]">
                      {m.scenario_name}
                    </span>
                    {m.id === seed.id && (
                      <Sparkles className="size-3 shrink-0 text-[hsl(var(--make-purple))]" />
                    )}
                  </span>
                  {m.one_line_summary && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {m.one_line_summary}
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    {m.team_name && <span>{m.team_name}</span>}
                    {m.trigger_app && (
                      <span className="font-mono text-[10px]">· {m.trigger_app}</span>
                    )}
                    {m.is_synthetic && (
                      <span className="rounded bg-amber-100 px-1 py-0 text-amber-900">demo</span>
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* RIGHT: actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Reuse this pattern</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                The seed scenario (
                <Sparkles className="inline size-3 text-[hsl(var(--make-purple))]" />) is the
                cleanest example. Open it in Adapt mode to generate a variant for your app stack.
              </p>
              <Button asChild variant="gradient" className="w-full justify-center">
                <Link href={`/scenarios/${seed.id}?adapt=1`}>
                  <Sparkles className="size-4" />
                  Adapt the seed
                </Link>
              </Button>
              {seed.make_team_id && (
                <Button asChild variant="outline" className="w-full justify-center">
                  <a
                    href={openInMakeUrl(seed.make_scenario_id, seed.make_team_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    Open seed in Make
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </main>
  )
}
