'use client'

// Lightweight filter bar for /patterns. Same UX shape as /browse:
// debounced text search + toggleable category chips. URL-driven so state is
// shareable and survives back/forward nav.

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CategoryFacet {
  value: string
  count: number
}

interface Props {
  categories: CategoryFacet[]
  totalPatterns: number
  visiblePatterns: number
}

export function PatternsFilterBar({ categories, totalPatterns, visiblePatterns }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const [searchValue, setSearchValue] = useState(params.get('q') ?? '')
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setSearchValue(params.get('q') ?? '')
  }, [params])

  function updateUrl(next: URLSearchParams) {
    const qs = next.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    startTransition(() => router.replace(url, { scroll: false }))
  }

  function onSearchChange(v: string) {
    setSearchValue(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (v.trim()) next.set('q', v.trim())
      else next.delete('q')
      updateUrl(next)
    }, 250)
  }

  function toggleCategory(value: string) {
    const next = new URLSearchParams(params)
    const current = next.getAll('category')
    if (current.includes(value)) {
      next.delete('category')
      for (const v of current.filter((x) => x !== value)) next.append('category', v)
    } else {
      next.append('category', value)
    }
    updateUrl(next)
  }

  function clearAll() {
    setSearchValue('')
    const next = new URLSearchParams(params)
    next.delete('q')
    next.delete('category')
    updateUrl(next)
  }

  const activeCategories = new Set(params.getAll('category'))
  const hasActiveFilter = activeCategories.size > 0 || params.get('q')

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search patterns by name, summary, or member scenario…"
          className="ring-make-focus h-10 w-full rounded-lg border border-[hsl(var(--make-purple)/0.16)] bg-card pl-10 pr-10 text-sm placeholder:text-muted-foreground/60"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="ring-make-focus absolute right-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((c) => {
          const active = activeCategories.has(c.value)
          return (
            <button
              key={c.value}
              onClick={() => toggleCategory(c.value)}
              className={cn(
                'ring-make-focus inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-[hsl(var(--make-purple))] bg-[hsl(var(--make-purple)/0.1)] text-[hsl(var(--make-purple))]'
                  : 'border-[hsl(var(--make-purple)/0.16)] bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="capitalize">{c.value}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] font-mono',
                  active
                    ? 'bg-[hsl(var(--make-purple)/0.2)] text-[hsl(var(--make-purple))]'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {c.count}
              </span>
            </button>
          )
        })}

        {hasActiveFilter && (
          <button
            onClick={clearAll}
            className="ring-make-focus ml-1 rounded text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {hasActiveFilter
            ? `Showing ${visiblePatterns} of ${totalPatterns} patterns`
            : `${totalPatterns} patterns`}
        </span>
      </div>
    </div>
  )
}
