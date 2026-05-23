import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { MakeLogo } from '@/components/brand/make-logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleSignInButton } from './google-button'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-make-gradient-soft blur-3xl"
      />

      <div className="w-full max-w-md">
        <Link
          href="/"
          className="ring-make-focus mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to landing
        </Link>

        <Card>
          <CardHeader>
            <MakeLogo />
            <CardTitle className="mt-4 text-2xl tracking-tighter">Sign in to Scenario KB</CardTitle>
            <CardDescription>
              Use the Google account tied to your Make organization. We only read scenarios in orgs
              you already have access to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.06)] p-3 text-xs text-[hsl(var(--danger))]">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <GoogleSignInButton next={next} />
            <p className="text-center text-xs text-muted-foreground">
              First time? Your admin needs to grant you access — see the
              <span className="font-medium"> README.md</span> &quot;Fresh install&quot; section.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in, you agree to the internal usage policy. No data leaves your Make org
          without your action.
        </p>
      </div>
    </main>
  )
}
