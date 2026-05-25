'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  LayoutGrid,
  Layers2,
  Plug,
  Settings,
  MessageCircleQuestion,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { APP_VERSION, changelogUrl } from '@/lib/utils/version'

// Coming-soon items are visible in the nav so testers see the roadmap shape,
// but they don't navigate (no 404s). Routes that were mockup-only leftovers
// (Collections, Versions) were removed entirely.
interface NavItem {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  comingSoon?: boolean
  /** Optional tooltip on hover — explains when it'll ship. */
  title?: string
}

const navItems: NavItem[] = [
  { href: '/chat', label: 'Ask KB', icon: MessageSquare },
  { href: '/browse', label: 'Browse', icon: LayoutGrid },
  {
    href: '/patterns',
    label: 'Patterns',
    icon: Layers2,
    comingSoon: true,
    title: 'Pattern clustering — needs ≥100 scenarios. Coming in v1.5.',
  },
  {
    href: '/connections',
    label: 'Connections',
    icon: Plug,
    comingSoon: true,
    title: 'Per-user Make.com tokens — coming in v1.5.',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    comingSoon: true,
    title: 'User preferences + role management — coming in v1.5.',
  },
]

export function Sidebar({ orgName }: { orgName?: string | null }) {
  const pathname = usePathname()
  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col justify-between border-r border-[hsl(var(--make-purple)/0.08)] bg-background px-3 py-4 md:flex">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          if (item.comingSoon) {
            // Render as a disabled, non-navigating row with a "Soon" pill.
            return (
              <div
                key={item.href}
                title={item.title ?? 'Coming soon'}
                className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
                aria-disabled="true"
              >
                <Icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-full bg-[hsl(var(--make-purple)/0.08)] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--make-purple))]">
                  Soon
                </span>
              </div>
            )
          }
          const active = pathname?.startsWith(item.href)
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
          <p className="mt-1 truncate text-muted-foreground" title={orgName ?? undefined}>
            {orgName ?? '—'}
          </p>
        </div>
        <a
          href={feedbackMailto()}
          className="ring-make-focus flex w-full items-center justify-center gap-2 rounded-md border border-[hsl(var(--make-purple)/0.3)] bg-[hsl(var(--make-purple)/0.08)] px-3 py-2 text-sm font-medium text-[hsl(var(--make-purple))] transition-colors hover:bg-[hsl(var(--make-purple)/0.14)]"
        >
          <MessageCircleQuestion className="size-4" />
          Give feedback
        </a>
        <VersionLabel />
      </div>
    </aside>
  )
}

function VersionLabel() {
  const { href, external } = changelogUrl()
  const label = `v${APP_VERSION}`
  // External URL (set via NEXT_PUBLIC_CHANGELOG_URL) opens in a new tab.
  // Internal /changelog uses Next.js client-side nav and renders CHANGELOG.md from repo root.
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="ring-make-focus block text-center text-[11px] text-muted-foreground/70 hover:text-[hsl(var(--make-purple))]"
        title="View version history"
      >
        {label} ↗
      </a>
    )
  }
  return (
    <Link
      href={href}
      className="ring-make-focus block text-center text-[11px] text-muted-foreground/70 hover:text-[hsl(var(--make-purple))]"
      title="View changelog"
    >
      {label}
    </Link>
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
