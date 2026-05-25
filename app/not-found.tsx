import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { MakeLogo } from '@/components/brand/make-logo'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-screen flex-col bg-background">
      {/* Soft brand-gradient backdrop, matched to landing page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--make-purple)/0.10),transparent_70%)]"
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="ring-make-focus flex items-center gap-2 rounded">
          <MakeLogo className="h-7 w-auto" />
          <span className="text-sm font-medium tracking-tightish text-foreground">Scenario KB</span>
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
        <p className="bg-gradient-to-r from-[hsl(var(--make-purple))] to-[hsl(var(--make-pink))] bg-clip-text font-mono text-7xl font-semibold leading-none tracking-tight text-transparent">
          404
        </p>
        <h1 className="mt-6 text-2xl font-semibold tracking-tighter">Page not found</h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          That URL doesn&apos;t exist — typo, stale link, or something we removed. Head back home and
          try again.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="gradient">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/chat">Ask KB</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
