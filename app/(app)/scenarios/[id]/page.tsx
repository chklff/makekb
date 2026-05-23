import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Zap,
  Layers2,
  Users,
  User as UserIcon,
  Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/supabase/types'
import { AdaptPanel } from './adapt-panel'

export const dynamic = 'force-dynamic'

type Scenario = Tables<'make_scenarios'>

interface BranchSummary {
  condition: string
  path_true: string
  path_false: string
}

export default async function ScenarioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ adapt?: string }>
}) {
  const { id } = await params
  const { adapt } = await searchParams
  const autoOpenAdapt = adapt === '1'

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('make_scenarios')
    .select('*')
    .eq('id', id)
    .maybeSingle<Scenario>()

  if (error || !data) {
    notFound()
  }
  const row: Scenario = data

  const apps = Array.isArray(row.apps_involved) ? (row.apps_involved as string[]) : []
  const tags = Array.isArray(row.tags) ? (row.tags as string[]) : []
  const branches = Array.isArray(row.branches_summary)
    ? (row.branches_summary as unknown as BranchSummary[])
    : []

  // Format reuse_notes as bullets if it contains numbered items, otherwise as plain text.
  const reuseBullets = parseBullets(row.reuse_notes ?? '')

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumb category={row.category ?? null} name={row.scenario_name} />

      <header>
        <h1 className="text-3xl font-semibold tracking-tighter">{row.scenario_name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {row.team_name && <Meta icon={<Users className="size-3.5" />} label={`Team: ${row.team_name}`} />}
          {row.created_by_name && (
            <Meta icon={<UserIcon className="size-3.5" />} label={`Owner: ${row.created_by_name}`} />
          )}
          {row.analyzed_at && (
            <Meta
              icon={<Clock className="size-3.5" />}
              label={`Analyzed ${formatRelative(row.analyzed_at)}`}
            />
          )}
        </div>
      </header>

      {row.one_line_summary && (
        <Card className="flex items-start gap-3 border-[hsl(var(--make-purple)/0.2)] bg-[hsl(var(--make-purple)/0.04)] p-4">
          <Sparkles className="size-4 shrink-0 text-[hsl(var(--make-purple))]" />
          <p className="text-sm text-foreground">{row.one_line_summary}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — Understanding */}
        <div className="space-y-4">
          {row.business_purpose && (
            <UnderstandingCard title="Business purpose">
              <p>{row.business_purpose}</p>
            </UnderstandingCard>
          )}

          {row.data_flow && (
            <UnderstandingCard title="Data flow">
              <p className="whitespace-pre-wrap">{row.data_flow}</p>
            </UnderstandingCard>
          )}

          {branches.length > 0 && (
            <UnderstandingCard title={`Branches (${branches.length})`}>
              <ul className="space-y-3">
                {branches.map((b, i) => (
                  <li key={i} className="rounded-md border border-[hsl(var(--make-purple)/0.12)] p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--make-purple))]">
                      {b.condition}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">If true:</span> {b.path_true}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">If false:</span> {b.path_false}
                    </p>
                  </li>
                ))}
              </ul>
            </UnderstandingCard>
          )}

          {row.error_handling && (
            <UnderstandingCard title="Error handling">
              <p className="whitespace-pre-wrap text-sm text-foreground/85">{row.error_handling}</p>
            </UnderstandingCard>
          )}

          {row.reuse_notes && (
            <Card className="border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-[hsl(var(--warning))]">
                  <AlertTriangle className="size-4" />
                  Reuse notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground/90">
                {reuseBullets.length > 0 ? (
                  <ul className="ml-5 list-disc space-y-1.5">
                    {reuseBullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="whitespace-pre-wrap">{row.reuse_notes}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT — Actions & metadata */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="size-4 text-[hsl(var(--make-purple))]" />
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="gradient" className="w-full justify-center" asChild>
                <a
                  href={openInMakeUrl(row.make_scenario_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Open in Make
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-center" asChild>
                <a href="#adapt-panel">
                  <Sparkles className="size-4" />
                  Adapt this scenario
                </a>
              </Button>
            </CardContent>
          </Card>

          <AdaptPanel
            scenarioId={row.id}
            scenarioName={row.scenario_name}
            autoOpen={autoOpenAdapt}
          />


          <Card>
            <CardHeader>
              <CardTitle className="text-sm">At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <KV k="Trigger" v={`${row.trigger_app ?? '?'} · ${row.trigger_event ?? '?'}`} />
              <KV k="Trigger type" v={row.trigger_type ?? '—'} />
              <KV k="Complexity" v={row.complexity ?? '—'} />
              <KV k="Category" v={row.category ?? '—'} />
              <KV k="Apps" v={apps.length > 0 ? apps.join(', ') : '—'} />
              <KV k="Make scenario id" v={row.make_scenario_id} mono />
              <KV k="Folder" v={row.folder_name ?? '—'} />
              <KV
                k="Last analyzed"
                v={row.analyzed_at ? new Date(row.analyzed_at).toLocaleString() : '—'}
              />
              <KV k="Model" v={row.llm_model_used ?? '—'} mono />
              <KV k="Prompt version" v={row.llm_prompt_version ?? '—'} mono />
            </CardContent>
          </Card>

          {tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[11px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Breadcrumb({ category, name }: { category: string | null; name: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link href="/browse" className="ring-make-focus rounded hover:text-foreground">
        Browse
      </Link>
      {category && (
        <>
          <span>›</span>
          <span>{category}</span>
        </>
      )}
      <span>›</span>
      <span className="truncate text-foreground">{name}</span>
    </nav>
  )
}

function Meta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </span>
  )
}

function UnderstandingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers2 className="size-4 text-[hsl(var(--make-purple))]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm leading-relaxed text-foreground/90">
        {children}
      </CardContent>
    </Card>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={`max-w-[60%] truncate text-right font-medium text-foreground ${mono ? 'font-mono text-[11px]' : ''}`}
        title={v}
      >
        {v}
      </span>
    </div>
  )
}

// Parse the LLM's reuse_notes — often comes back as "(1) … (2) … (3) …" — into a clean array.
function parseBullets(text: string): string[] {
  if (!text) return []
  const matches = text.match(/\(\d+\)\s+[^()]+(?=\(\d+\)|$)/g)
  if (matches && matches.length >= 2) return matches.map((m) => m.replace(/^\(\d+\)\s+/, '').trim())
  return []
}

function openInMakeUrl(makeScenarioId: string): string {
  const base = process.env.MAKE_WEB_BASE_URL ?? 'https://eu1.make.com'
  return `${base.replace(/\/$/, '')}/scenario/${makeScenarioId}/edit`
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const d = Math.round(hr / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
