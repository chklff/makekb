'use client'

import { useState, useRef, useEffect } from 'react'
import { LogOut, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UserMenuProps {
  initials: string
  email: string
  isAdmin: boolean
}

export function UserMenu({ initials, email, isAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ring-make-focus ml-2 flex items-center gap-1 rounded-full"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--make-purple)/0.12)] text-xs font-medium text-[hsl(var(--make-purple))]">
          {initials}
        </span>
        <ChevronDown className={cn('size-3 text-muted-foreground transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-[hsl(var(--make-purple)/0.12)] bg-card p-2 shadow-make-md"
        >
          <div className="px-3 py-2 text-xs">
            <p className="truncate font-medium text-foreground">{email}</p>
            <p className="mt-0.5 text-muted-foreground">{isAdmin ? 'Admin' : 'Member'}</p>
          </div>
          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="ring-make-focus flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-[hsl(var(--make-purple)/0.06)]"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
