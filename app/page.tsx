import Link from 'next/link'
import { ArrowRight, Search, Sparkles, GitBranch } from 'lucide-react'
import { MakeLogo } from '@/components/brand/make-logo'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      {/* Soft brand-gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-make-gradient-soft blur-3xl"
      />

      <header className="flex items-center justify-between px-8 py-6">
        <MakeLogo />
        <Button asChild variant="ghost" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-12 text-center sm:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--make-purple)/0.25)] bg-white px-3 py-1 text-xs text-[hsl(var(--make-purple))]">
          <Sparkles className="size-3.5" />
          Powered by Claude Sonnet 4.5
        </span>
        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tighter sm:text-6xl">
          <span className="text-gradient">Stop rebuilding</span> scenarios you already have.
        </h1>
        <p className="mt-5 text-balance text-base text-muted-foreground sm:text-lg">
          Scenario KB indexes every Make.com automation in your organization, understands what each one
          does, and lets your team ask, browse, and reuse in plain English.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild variant="gradient" size="lg">
            <Link href="/sign-in">
              Sign in with Google
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/browse">Browse demo</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-3">
        <FeatureCard
          icon={<Sparkles className="size-5 text-[hsl(var(--make-purple))]" />}
          title="Ask in plain English"
          body="“Do we have a HubSpot → Facebook CAPI scenario?” Get a grounded answer with citations."
        />
        <FeatureCard
          icon={<Search className="size-5 text-[hsl(var(--make-purple))]" />}
          title="Browse the library"
          body="Filter by app, team, complexity. See patterns that collapse three near-duplicates into one card."
        />
        <FeatureCard
          icon={<GitBranch className="size-5 text-[hsl(var(--make-purple))]" />}
          title="Adapt with AI"
          body="“Swap HubSpot for Pipedrive, keep everything else.” Get a downloadable variant blueprint."
        />
      </section>
    </main>
  )
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--make-purple)/0.12)] bg-card p-5 shadow-make-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--make-purple)/0.08)]">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-medium tracking-tightish">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
