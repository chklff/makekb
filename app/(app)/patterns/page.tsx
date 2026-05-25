// /patterns — automatically discovered scenario clusters.
//
// What a "pattern" is: a group of scenarios that solve the same problem with
// different app combinations. E.g. all the "When a new deal closes, notify the
// team" scenarios across HubSpot/Salesforce/Pipedrive × Slack/Teams/Discord
// form one pattern.
//
// How it works: greedy nearest-neighbor in embedding space (cosine ≥ 0.85). See
// lib/clustering/greedy.ts. Real + synthetic rows by default — this is the page
// where the demo data is actually meant to be visible.

import Link from 'next/link'
import { Sparkles, Layers2, Users, Zap, Beaker } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { computePatterns, type Pattern } from '@/lib/clustering/greedy'

export const dynamic = 'force-dynamic'

export default async function PatternsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const includeDemo = sp.demo !== '0' // default ON for /patterns — different from /browse
  const threshold = Math.max(0.5, Math.min(0.99, Number(sp.threshold ?? 0.85) || 0.85))

  const supabase = await createClient()
  const patterns = await computePatterns(supabase, {
    threshold,
    minMembers: 2,
    includeSynthetic: includeDemo,
  })

  const totalScenariosInPatterns = patterns.reduce((acc, p) => acc + p.members.length, 0)
  const realOnly = patterns.filter((p) => p.mix === 'real-only').length
  const synthOnly = patterns.filter((p) => p.mix === 'synthetic-only').length
  const mixed = patterns.filter((p) => p.mix === 'mixed').length

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers2 className="size-5 text-[hsl(var(--make-purple))]" />
          <h1 className="text-2xl font-semibold tracking-tighter">Patterns</h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Scenarios that solve the same problem with different apps. Automatically discovered by
          grouping scenarios whose embeddings are within{' '}
          <span className="font-mono">{threshold.toFixed(2)}</span> cosine similarity. Singletons
          (one-off scenarios with no near-neighbors) are not shown.
        </p>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Stat label="Patterns" value={patterns.length} />
          <Stat label="Scenarios in patterns" value={totalScenariosInPatterns} />
          <Stat label="Real-only" value={realOnly} />
          <Stat label="Synthetic-only" value={synthOnly} />
          <Stat label="Mixed" value={mixed} />
        </div>
      </header>

      {patterns.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <p>
            No patterns found at threshold {threshold.toFixed(2)}. Either the org has fewer than
            ~10 scenarios, or scenarios are too dissimilar. Try lowering the threshold:{' '}
            <Link href="/patterns?threshold=0.75" className="underline">
              /patterns?threshold=0.75
            </Link>
            .
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {patterns.map((p) => (
            <PatternCard key={p.index} p={p} />
          ))}
        </div>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-[hsl(var(--make-purple)/0.12)] bg-card px-2.5 py-1">
      <span className="font-semibold text-foreground">{value}</span>{' '}
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

function PatternCard({ p }: { p: Pattern }) {
  const { seed, members } = p
  const otherMembers = members.slice(1, 7) // up to 6 examples besides the seed
  const extra = members.length - 1 - otherMembers.length

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="text-base font-semibold leading-tight tracking-tightish">
            {seed.one_line_summary ?? seed.scenario_name}
          </h3>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {members.length} scenarios
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {p.categories.map((c) => (
          <Badge key={c} variant="outline" className="text-[10px]">
            {c}
          </Badge>
        ))}
        {p.mix === 'synthetic-only' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
            <Beaker className="size-3" />
            Demo
          </span>
        )}
        {p.mix === 'mixed' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            <Beaker className="size-3" />
            Some demo
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
        <Zap className="mt-0.5 size-3" />
        <span>Trigger apps:</span>
        {p.trigger_apps.slice(0, 6).map((a) => (
          <span
            key={a}
            className="rounded bg-[hsl(var(--make-purple)/0.06)] px-1.5 py-0.5 font-mono text-[10px] text-foreground"
          >
            {a}
          </span>
        ))}
        {p.trigger_apps.length > 6 && (
          <span className="text-[10px] text-muted-foreground">+{p.trigger_apps.length - 6} more</span>
        )}
      </div>

      <div className="space-y-1 text-xs">
        <p className="font-medium text-foreground">Variants in this pattern:</p>
        <ul className="space-y-1">
          <li>
            <Link
              href={`/scenarios/${seed.id}`}
              className="ring-make-focus group flex items-baseline gap-2 rounded text-foreground hover:text-[hsl(var(--make-purple))]"
            >
              <span className="font-mono text-[10px] text-muted-foreground">100%</span>
              <span className="truncate group-hover:underline">{seed.scenario_name}</span>
              <Sparkles className="size-3 shrink-0 text-[hsl(var(--make-purple))] opacity-60" />
            </Link>
          </li>
          {otherMembers.map((m) => (
            <li key={m.id}>
              <Link
                href={`/scenarios/${m.id}`}
                className="ring-make-focus group flex items-baseline gap-2 rounded text-muted-foreground hover:text-[hsl(var(--make-purple))]"
              >
                <span className="font-mono text-[10px]">
                  {Math.round(m.similarity_to_seed * 100)}%
                </span>
                <span className="truncate group-hover:underline">{m.scenario_name}</span>
              </Link>
            </li>
          ))}
        </ul>
        {extra > 0 && (
          <p className="text-[11px] text-muted-foreground">+ {extra} more variants in this pattern</p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[hsl(var(--make-purple)/0.08)] pt-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" />
          Cleanest example marked with{' '}
          <Sparkles className="inline size-3 text-[hsl(var(--make-purple))]" />
        </span>
        <Link
          href={`/scenarios/${seed.id}?adapt=1`}
          className="ring-make-focus rounded font-medium text-[hsl(var(--make-purple))] hover:underline"
        >
          Reuse →
        </Link>
      </div>
    </Card>
  )
}
