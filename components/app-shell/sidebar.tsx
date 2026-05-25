'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, LayoutGrid, Layers2, FolderOpen, History, Plug, Settings, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/chat', label: 'Ask KB', icon: MessageSquare },
  { href: '/browse', label: 'Browse', icon: LayoutGrid },
  { href: '/patterns', label: 'Patterns', icon: Layers2 },
  { href: '/collections', label: 'Collections', icon: FolderOpen },
  { href: '/versions', label: 'Versions', icon: History },
  { href: '/connections', label: 'Connections', icon: Plug },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col justify-between border-r border-[hsl(var(--make-purple)/0.08)] bg-background px-3 py-4 md:flex">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'ring-make-focus flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-[hsl(var(--make-purple)/0.1)] font-medium text-[hsl(var(--make-purple))]'
                  : 'text-muted-foreground hover:bg-[hsl(var(--make-purple)/0.06)] hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="space-y-3">
        <div className="rounded-lg border border-[hsl(var(--make-purple)/0.12)] bg-white p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
            <span className="font-medium text-foreground">Make connected</span>
          </div>
          <p className="mt-1 text-muted-foreground">scn-kb-prod</p>
        </div>
        <a
          href={feedbackMailto()}
          className="ring-make-focus flex w-full items-center justify-center gap-2 rounded-md border border-[hsl(var(--make-purple)/0.3)] bg-[hsl(var(--make-purple)/0.08)] px-3 py-2 text-sm font-medium text-[hsl(var(--make-purple))] transition-colors hover:bg-[hsl(var(--make-purple)/0.14)]"
        >
          <MessageCircleQuestion className="size-4" />
          Give feedback
        </a>
      </div>
    </aside>
  )
}

function feedbackMailto(): string {
  const to = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL ?? 'o.chekalov@make.com'
  const subject = encodeURIComponent('Make Scenario KB feedback')
  const body = encodeURIComponent(
    [
      'What I tried:',
      '',
      'What happened vs what I expected:',
      '',
      'Browser / page URL (helps a lot):',
      '',
    ].join('\n'),
  )
  return `mailto:${to}?subject=${subject}&body=${body}`
}
