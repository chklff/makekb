import Link from 'next/link'
import {
  ArrowRight,
  Sparkles,
  Search,
  GitBranch,
  Shield,
  Brain,
  RefreshCw,
  ExternalLink,
  Copy,
  Layers2,
} from 'lucide-react'
import { MakeLogo } from '@/components/brand/make-logo'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  // Auth-aware: switch the header / hero CTA based on whether the user is signed in.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isSignedIn = Boolean(user)

  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      {/* Soft brand-gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[28rem] bg-make-gradient-soft blur-3xl"
      />

      {/* ──────────── Header ──────────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <MakeLogo />
        <nav className="flex items-center gap-2">
          <Link
            href="#how-it-works"
            className="ring-make-focus hidden rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            How it works
          </Link>
          <Link
            href="#faq"
            className="ring-make-focus hidden rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            FAQ
          </Link>
          {isSignedIn ? (
            <Button asChild variant="gradient" size="sm">
              <Link href="/chat">
                Open KB
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </nav>
      </header>

      {/* ──────────── Hero ──────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-12 text-center sm:pt-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--make-purple)/0.25)] bg-white px-3 py-1 text-xs text-[hsl(var(--make-purple))] shadow-make-sm">
          <Sparkles className="size-3.5" />
          Powered by Claude Sonnet 4.5
        </span>
        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tighter sm:text-6xl">
          <span className="text-gradient">Stop rebuilding</span>
          <br className="sm:hidden" /> scenarios you already have.
        </h1>
        <p className="mt-5 text-balance text-base text-muted-foreground sm:text-lg">
          Scenario KB indexes every Make.com automation in your organization, understands what each
          one does, and lets your team ask, browse, and reuse in plain English.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          {isSignedIn ? (
            <Button asChild variant="gradient" size="lg">
              <Link href="/chat">
                Open Scenario KB
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="gradient" size="lg">
              <Link href="/sign-in">
                Sign in with Google
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <Link href="#how-it-works">See how it works</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Internal tool · No data leaves your Make org · Sonnet 4.5 + GPT embeddings under the hood
        </p>
      </section>

      {/* ──────────── When to use it (jobs-to-be-done) ──────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--make-purple))]">
            When to use it
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-4xl">
            Three moments where it saves you an hour.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <UseCase
            tag="Before you build"
            title="“Does this already exist?”"
            body="You're about to spin up a new scenario for a sync that's probably been done before. Search the KB in plain English — most of the time, you'll find a close match and skip rebuilding."
            example='"Do we already have HubSpot → Slack notification?"'
          />
          <UseCase
            tag="Before you copy-paste"
            title="“I want this one — but for Pipedrive.”"
            body="An old scenario does almost what you need. Click Adapt with AI, describe the difference, get a downloadable variant. No more duplicate-then-edit-30-modules-by-hand."
            example='"Swap HubSpot for Pipedrive, keep everything else"'
          />
          <UseCase
            tag="When you join a team"
            title="“What's already in here?”"
            body="New to a team or onboarding a customer? Browse and filter to learn what they automate, who owns what, and where the patterns are — without opening 50 scenarios one by one."
            example="Filter by Team · App · Complexity to see the lay of the land"
          />
        </div>
      </section>

      {/* ──────────── Feature cards with realistic UI samples ──────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 lg:grid-cols-3">
          <FeatureCard
            badge={<Sparkles className="size-4" />}
            title="Ask in plain English"
            body='"Do we have a scenario that syncs HubSpot deals to Facebook CAPI?" Get a grounded answer with [1] [2] citations linking to the source scenarios.'
            preview={<ChatPreview />}
          />
          <FeatureCard
            badge={<Search className="size-4" />}
            title="Browse + filter"
            body="Search, then narrow by app, team, category, complexity, and match score. Every URL is shareable."
            preview={<BrowsePreview />}
          />
          <FeatureCard
            badge={<GitBranch className="size-4" />}
            title="Adapt with AI"
            body='"Swap HubSpot for Pipedrive, keep everything else." Get a variant blueprint JSON + change summary + warnings, ready to import into Make.'
            preview={<AdaptPreview />}
          />
        </div>
      </section>

      {/* ──────────── FAQ ──────────── */}
      <section id="faq" className="mx-auto max-w-3xl px-6 pb-24">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-[hsl(var(--make-purple))]">
          Common questions
        </p>
        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tighter">FAQ</h2>

        <dl className="mt-10 space-y-6">
          <Faq
            icon={<Search className="size-4" />}
            q="How do I find a scenario fast?"
            a="Two paths: (1) Ask KB in plain English — best when you don't know what you're looking for or want grounded answers with citations. (2) Browse + search — best when you know the app or team and want to scan results visually."
          />
          <Faq
            icon={<GitBranch className="size-4" />}
            q="Can I edit a scenario from here?"
            a="No — editing happens in Make. From any scenario page you can Open in Make, or use Adapt with AI to generate a variant blueprint that you then import into Make as a new scenario."
          />
          <Faq
            icon={<Sparkles className="size-4" />}
            q="What if Adapt with AI gets it wrong?"
            a="The output always lists warnings — fields the AI was uncertain about. Treat the generated blueprint as a starting draft, not the final answer. Open it in Make, check the mappings, fix what the warnings flagged. The KB never modifies your real Make scenarios."
          />
          <Faq
            icon={<RefreshCw className="size-4" />}
            q="A scenario I just created/edited isn't showing up. Why?"
            a="An admin needs to click Re-sync (top bar). It pulls the latest from Make. Unchanged scenarios skip the AI call (hash-deduped), so re-syncs are cheap and fast."
          />
          <Faq
            icon={<Brain className="size-4" />}
            q="What does the match % mean?"
            a="A score from 0–100% combining semantic similarity (the AI's understanding) and keyword match. Above 70% is usually relevant. Below 30% means we found something but it's a stretch — use the Match ≥ slider on Browse to hide low-confidence matches."
          />
          <Faq
            icon={<Shield className="size-4" />}
            q="Who can see my scenarios?"
            a="Only members of the same Make organization. Sign-in is scoped via Google + RLS on every database query — you cannot see another org's scenarios even by URL guessing. Blueprints are processed by Anthropic and OpenAI APIs; neither trains on API traffic."
          />
          <Faq
            icon={<Layers2 className="size-4" />}
            q="Will it group similar scenarios into patterns?"
            a="Yes — once you have 100+ scenarios, clustering automatically surfaces patterns (e.g. three near-duplicate CRM → ad sync scenarios collapse into one card with three variants). Available in v1.5."
          />
        </dl>
      </section>

      {/* ──────────── Final CTA ──────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="rounded-2xl border border-[hsl(var(--make-purple)/0.18)] bg-make-gradient-soft p-10">
          <h2 className="text-2xl font-semibold tracking-tighter sm:text-3xl">
            Ready to stop rebuilding?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Sign in with your Make Google account. First-time sign-ins from the company domain get
            access automatically.
          </p>
          <div className="mt-6">
            <Button asChild variant="gradient" size="lg">
              <Link href={isSignedIn ? '/chat' : '/sign-in'}>
                {isSignedIn ? 'Open Scenario KB' : 'Sign in with Google'}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-center text-xs text-muted-foreground">
        Internal tool · Self-hosted on Vercel + Supabase ·{' '}
        <a
          href="mailto:o.chekalov@make.com?subject=Make%20Scenario%20KB%20feedback"
          className="ring-make-focus rounded font-medium text-[hsl(var(--make-purple))] hover:underline"
        >
          Send feedback
        </a>
      </footer>
    </main>
  )
}

// ──────────── Building blocks ────────────

function UseCase({
  tag,
  title,
  body,
  example,
}: {
  tag: string
  title: string
  body: string
  example: string
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[hsl(var(--make-purple)/0.12)] bg-card p-6 shadow-make-sm">
      <span className="inline-flex w-fit items-center rounded-full bg-[hsl(var(--make-purple)/0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[hsl(var(--make-purple))]">
        {tag}
      </span>
      <h3 className="mt-3 text-lg font-medium tracking-tightish">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-4 rounded-md border border-dashed border-[hsl(var(--make-purple)/0.2)] bg-[hsl(var(--make-purple)/0.04)] p-2.5 text-xs italic text-foreground/80">
        {example}
      </div>
    </div>
  )
}

function FeatureCard({
  badge,
  title,
  body,
  preview,
}: {
  badge: React.ReactNode
  title: string
  body: string
  preview: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--make-purple)/0.12)] bg-card shadow-make-sm">
      <div className="border-b border-[hsl(var(--make-purple)/0.08)] bg-[hsl(var(--make-purple)/0.03)] p-4">
        {preview}
      </div>
      <div className="p-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--make-purple)/0.08)] text-[hsl(var(--make-purple))]">
          {badge}
        </div>
        <h3 className="mt-4 text-base font-medium tracking-tightish">{title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

function Faq({ icon, q, a }: { icon: React.ReactNode; q: string; a: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--make-purple)/0.08)] text-[hsl(var(--make-purple))]">
        {icon}
      </span>
      <div>
        <dt className="text-sm font-medium tracking-tightish">{q}</dt>
        <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{a}</dd>
      </div>
    </div>
  )
}

// ──────────── Mini UI mockups (pure CSS — no images needed) ────────────

function ChatPreview() {
  return (
    <div className="space-y-2 text-[11px]">
      <div className="ml-auto inline-block max-w-[80%] rounded-2xl rounded-br-md bg-[hsl(var(--make-purple)/0.08)] px-3 py-2 text-foreground">
        Do we have anything for HubSpot → Facebook CAPI?
      </div>
      <div className="flex items-start gap-2">
        <div className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-make-gradient">
          <Sparkles className="size-3 text-white" />
        </div>
        <p className="text-foreground">
          Yes — there&apos;s an active scenario.
          <span className="mx-1 inline-flex h-4 items-center justify-center rounded bg-make-gradient px-1 text-[9px] font-medium text-white">
            [1]
          </span>
          <span className="inline-flex h-4 items-center justify-center rounded bg-make-gradient px-1 text-[9px] font-medium text-white">
            [2]
          </span>
        </p>
      </div>
      <div className="rounded-md border border-[hsl(var(--make-purple)/0.12)] bg-white p-2">
        <div className="flex items-start justify-between gap-1">
          <span className="font-medium text-foreground">HubSpot → Facebook CAPI</span>
          <span className="rounded-full bg-[hsl(var(--success)/0.12)] px-1.5 py-0.5 text-[9px] font-medium text-[hsl(var(--success))]">
            98% match
          </span>
        </div>
      </div>
    </div>
  )
}

function BrowsePreview() {
  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--make-purple)/0.16)] bg-white px-2 py-1.5">
        <Search className="size-3 text-muted-foreground" />
        <span className="text-foreground">webhook</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded-md border border-[hsl(var(--make-purple)/0.4)] bg-[hsl(var(--make-purple)/0.08)] px-2 py-0.5 text-[10px] text-[hsl(var(--make-purple))]">
          App 1
        </span>
        <span className="rounded-md border border-[hsl(var(--make-purple)/0.16)] px-2 py-0.5 text-[10px] text-muted-foreground">
          Team
        </span>
        <span className="rounded-md border border-[hsl(var(--make-purple)/0.16)] px-2 py-0.5 text-[10px] text-muted-foreground">
          Complexity
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--make-purple)/0.4)] bg-[hsl(var(--make-purple)/0.08)] px-2 py-0.5 text-[10px] text-[hsl(var(--make-purple))]">
          Match ≥ 60%
        </span>
      </div>
      <div className="rounded-md border border-[hsl(var(--make-purple)/0.12)] bg-white p-2">
        <p className="font-medium text-foreground">Webhook Recipient Data Store</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Internal Tools · simple · webhook</p>
      </div>
    </div>
  )
}

function AdaptPreview() {
  return (
    <div className="space-y-2 text-[11px]">
      <div className="rounded-md border border-[hsl(var(--make-purple)/0.2)] bg-[hsl(var(--make-pink-tint)/1)] p-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-[hsl(var(--make-purple))]" />
          <span className="font-medium text-foreground">Adapt with AI</span>
        </div>
        <p className="mt-1.5 italic text-muted-foreground">swap HubSpot for Pipedrive</p>
      </div>
      <div className="rounded-md border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.06)] p-2">
        <p className="font-medium text-[hsl(var(--success))]">✓ Variant ready</p>
        <ul className="mt-1 space-y-0.5 text-foreground">
          <li className="flex gap-1">
            <Copy className="mt-0.5 size-2.5 shrink-0 text-[hsl(var(--make-purple))]" />
            <span>Trigger swapped to Pipedrive Deal Updated</span>
          </li>
          <li className="flex gap-1">
            <ExternalLink className="mt-0.5 size-2.5 shrink-0 text-[hsl(var(--make-purple))]" />
            <span>2 fields need manual review</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
