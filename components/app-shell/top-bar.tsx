import Link from 'next/link'
import { BookOpen, History } from 'lucide-react'
import { MakeLogo } from '@/components/brand/make-logo'
import { Button } from '@/components/ui/button'
import { ResyncButton } from './resync-button'
import { UserMenu } from './user-menu'

interface TopBarProps {
  scenarioCount: number
  patternCount: number
  userInitials: string
  userEmail: string
  isAdmin: boolean
}

export function TopBar({
  scenarioCount,
  patternCount,
  userInitials,
  userEmail,
  isAdmin,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[hsl(var(--make-purple)/0.08)] bg-background/85 px-6 backdrop-blur">
      <div className="flex items-center gap-5">
        <Link href="/chat" className="ring-make-focus rounded-md">
          <MakeLogo />
        </Link>
        <p className="text-sm text-muted-foreground">
          {scenarioCount.toLocaleString()} scenario{scenarioCount === 1 ? '' : 's'} indexed
          {patternCount > 0 && (
            <>
              <span className="px-2 text-muted-foreground/40">·</span>
              {patternCount.toLocaleString()} reusable pattern{patternCount === 1 ? '' : 's'}
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/browse">
            <BookOpen className="size-4" />
            Browse
          </Link>
        </Button>
        <Button variant="ghost" size="sm">
          <History className="size-4" />
          History
        </Button>
        {isAdmin && <ResyncButton />}
        <UserMenu initials={userInitials} email={userEmail} isAdmin={isAdmin} />
      </div>
    </header>
  )
}
