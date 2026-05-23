'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterOption {
  value: string
  count: number
}

export interface FilterFacets {
  apps: FilterOption[]
  categories: FilterOption[]
  teams: FilterOption[]
  complexity: FilterOption[]
}

interface Props {
  facets: FilterFacets
}

export function FilterBar({ facets }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  // Search input is local + debounced.
  const [searchValue, setSearchValue] = useState(params.get('q') ?? '')
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  // Min-match slider state (only relevant when searching).
  const [minMatch, setMinMatch] = useState(Number(params.get('min_match') ?? 0))
  const matchTimer = useRef<NodeJS.Timeout | null>(null)

  // Sync state if the user navigates back/forward.
  useEffect(() => {
    setSearchValue(params.get('q') ?? '')
    setMinMatch(Number(params.get('min_match') ?? 0))
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
    }, 300)
  }

  function onMinMatchChange(v: number) {
    setMinMatch(v)
    if (matchTimer.current) clearTimeout(matchTimer.current)
    matchTimer.current = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (v > 0) next.set('min_match', String(v))
      else next.delete('min_match')
      updateUrl(next)
    }, 200)
  }

  function toggleFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    const current = next.getAll(key)
    if (current.includes(value)) {
      next.delete(key)
      for (const v of current.filter((x) => x !== value)) next.append(key, v)
    } else {
      next.append(key, value)
    }
    updateUrl(next)
  }

  function clearAll() {
    setSearchValue('')
    setMinMatch(0)
    updateUrl(new URLSearchParams())
  }

  const activeApps = params.getAll('app')
  const activeCategories = params.getAll('category')
  const activeTeams = params.getAll('team')
  const activeComplexity = params.getAll('complexity')
  const isSearching = Boolean(searchValue.trim())
  const hasAnyFilter =
    isSearching ||
    activeApps.length > 0 ||
    activeCategories.length > 0 ||
    activeTeams.length > 0 ||
    activeComplexity.length > 0 ||
    minMatch > 0

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search scenarios, patterns, apps, or keywords…"
          className="ring-make-focus h-11 w-full rounded-lg border border-[hsl(var(--make-purple)/0.16)] bg-white pl-10 pr-9 text-sm outline-none placeholder:text-muted-foreground"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="ring-make-focus absolute right-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Filter dropdowns row */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Team"
          options={facets.teams}
          active={activeTeams}
          onToggle={(v) => toggleFilter('team', v)}
        />
        <FilterDropdown
          label="App"
          options={facets.apps}
          active={activeApps}
          onToggle={(v) => toggleFilter('app', v)}
        />
        <FilterDropdown
          label="Category"
          options={facets.categories}
          active={activeCategories}
          onToggle={(v) => toggleFilter('category', v)}
        />
        <FilterDropdown
          label="Complexity"
          options={facets.complexity}
          active={activeComplexity}
          onToggle={(v) => toggleFilter('complexity', v)}
        />
        {/* Min-match slider — inline with dropdowns. Only visible when searching. */}
        {isSearching && (
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors',
              minMatch > 0
                ? 'border-[hsl(var(--make-purple)/0.4)] bg-[hsl(var(--make-purple)/0.08)] text-[hsl(var(--make-purple))]'
                : 'border-[hsl(var(--make-purple)/0.16)] bg-white text-muted-foreground',
            )}
            title="Filter by match score"
          >
            <span className="whitespace-nowrap">Match ≥</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minMatch}
              onChange={(e) => onMinMatchChange(Number(e.target.value))}
              className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-secondary outline-none accent-[hsl(var(--make-purple))]"
              aria-label="Minimum match percent"
            />
            <span className="min-w-[2.5rem] text-right font-medium tabular-nums">{minMatch}%</span>
          </div>
        )}

        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="ring-make-focus text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filters as removable pills */}
      {(activeApps.length || activeCategories.length || activeTeams.length || activeComplexity.length) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeApps.map((v) => (
            <ActivePill key={`app-${v}`} label={`App: ${v}`} onRemove={() => toggleFilter('app', v)} />
          ))}
          {activeCategories.map((v) => (
            <ActivePill key={`cat-${v}`} label={`Category: ${v}`} onRemove={() => toggleFilter('category', v)} />
          ))}
          {activeTeams.map((v) => (
            <ActivePill key={`team-${v}`} label={`Team: ${v}`} onRemove={() => toggleFilter('team', v)} />
          ))}
          {activeComplexity.map((v) => (
            <ActivePill key={`cx-${v}`} label={v} onRemove={() => toggleFilter('complexity', v)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterDropdown({
  label,
  options,
  active,
  onToggle,
}: {
  label: string
  options: FilterOption[]
  active: string[]
  onToggle: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const hasActive = active.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'ring-make-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
          hasActive
            ? 'border-[hsl(var(--make-purple)/0.4)] bg-[hsl(var(--make-purple)/0.08)] text-[hsl(var(--make-purple))]'
            : 'border-[hsl(var(--make-purple)/0.16)] bg-white text-muted-foreground hover:bg-[hsl(var(--make-purple)/0.06)] hover:text-foreground',
        )}
      >
        {label}
        {hasActive && (
          <span className="rounded-full bg-[hsl(var(--make-purple)/0.2)] px-1.5 text-[10px] font-semibold">
            {active.length}
          </span>
        )}
        <ChevronDown className={cn('size-3 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-[hsl(var(--make-purple)/0.16)] bg-card p-1 shadow-make-md"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No options</p>
          ) : (
            options.map((opt) => {
              const checked = active.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  onClick={() => onToggle(opt.value)}
                  className="ring-make-focus flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-[hsl(var(--make-purple)/0.06)]"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'grid h-4 w-4 place-items-center rounded border',
                        checked
                          ? 'border-[hsl(var(--make-purple))] bg-[hsl(var(--make-purple))]'
                          : 'border-[hsl(var(--make-purple)/0.3)] bg-white',
                      )}
                    >
                      {checked && <Check className="size-3 text-white" />}
                    </span>
                    <span className="truncate">{opt.value}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{opt.count}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--make-purple)/0.12)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--make-purple))]">
      {label}
      <button onClick={onRemove} aria-label="Remove" className="ring-make-focus rounded">
        <X className="size-3" />
      </button>
    </span>
  )
}
