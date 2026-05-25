import { redirect } from 'next/navigation'
import Link from 'next/link'
import { TopBar } from '@/components/app-shell/top-bar'
import { Sidebar } from '@/components/app-shell/sidebar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAppUserContext } from '@/lib/auth/user-context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppUserContext()
  if (!ctx) redirect('/sign-in')

  // No org membership → polite empty state (still inside the shell so they can sign out).
  if (ctx.memberships.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar
          scenarioCount={0}
          patternCount={0}
          userInitials={initialsOf(ctx.user)}
          userEmail={ctx.user.email ?? ''}
          isAdmin={false}
        />
        <main className="mx-auto max-w-xl px-6 py-24">
          <Card className="p-8 text-center">
            <h1 className="text-xl font-semibold tracking-tighter">No org access yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account isn&apos;t linked to any Make organization in this KB yet. An admin needs
              to run:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-md bg-secondary p-3 text-left text-xs">
              {`pnpm tsx scripts/grant-user-org-access.ts \\
  --email=${ctx.user.email ?? 'your@email'} \\
  --make_org_id=<org-id>`}
            </pre>
            <Button asChild variant="ghost" size="sm" className="mt-4">
              <Link href="/">Back to landing</Link>
            </Button>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        scenarioCount={ctx.counts.scenarios}
        patternCount={ctx.counts.patterns}
        userInitials={initialsOf(ctx.user)}
        userEmail={ctx.user.email ?? ''}
        isAdmin={ctx.isAdmin}
      />
      <div className="mx-auto flex max-w-[1500px]">
        <Sidebar orgName={ctx.memberships[0]?.org_name ?? null} />
        <div className="flex-1 px-6 py-8 md:px-10">{children}</div>
      </div>
    </div>
  )
}

function initialsOf(user: {
  email?: string | null
  user_metadata?: Record<string, unknown>
}): string {
  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '??'
  const parts = name.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}
