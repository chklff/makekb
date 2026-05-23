'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, X, AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'discovering' | 'syncing' | 'done' | 'error'

interface State {
  phase: Phase
  total: number
  done: number
  success: number
  skipped: number
  failed: number
  current: string | null
  duration_ms: number
  error: string | null
}

const INITIAL: State = {
  phase: 'idle',
  total: 0,
  done: 0,
  success: 0,
  skipped: 0,
  failed: 0,
  current: null,
  duration_ms: 0,
  error: null,
}

export function ResyncButton() {
  const router = useRouter()
  const [state, setState] = useState<State>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-dismiss successful runs after 8s.
  useEffect(() => {
    if (state.phase !== 'done' || state.failed > 0) return
    const t = setTimeout(() => setState(INITIAL), 8000)
    return () => clearTimeout(t)
  }, [state.phase, state.failed])

  const isActive = state.phase === 'discovering' || state.phase === 'syncing'

  async function start() {
    if (isActive) return
    setState({ ...INITIAL, phase: 'discovering' })

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const resp = await fetch('/api/ingest/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 50, concurrency: 3 }),
        signal: ctrl.signal,
      })
      if (!resp.ok || !resp.body) {
        const body = await resp.text().catch(() => '')
        throw new Error(body.slice(0, 200) || `HTTP ${resp.status}`)
      }
      await consumeNdjson(resp.body, (evt) => {
        if (evt.type === 'start') {
          setState((s) => ({ ...s, phase: 'syncing', total: evt.total ?? 0 }))
        } else if (evt.type === 'progress') {
          setState((s) => {
            const next: State = {
              ...s,
              done: evt.done ?? s.done,
              current: evt.scenario_id ?? null,
            }
            if (evt.status === 'success') next.success++
            else if (evt.status === 'skipped_hash_match') next.skipped++
            else if (typeof evt.status === 'string' && evt.status.startsWith('failed')) next.failed++
            return next
          })
        } else if (evt.type === 'done' && evt.summary) {
          setState((s) => ({
            ...s,
            phase: 'done',
            duration_ms: evt.summary!.duration_ms,
            success: evt.summary!.success,
            skipped: evt.summary!.skipped_hash_match,
            failed: evt.summary!.failed,
            total: evt.summary!.total,
            done: evt.summary!.total,
            current: null,
          }))
          router.refresh()
        } else if (evt.type === 'error') {
          setState((s) => ({ ...s, phase: 'error', error: evt.error ?? 'unknown error' }))
        }
      })
    } catch (err) {
      if (ctrl.signal.aborted) {
        setState(INITIAL)
        return
      }
      setState((s) => ({
        ...s,
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      abortRef.current = null
    }
  }

  function cancel() {
    abortRef.current?.abort()
    setState(INITIAL)
  }

  function dismiss() {
    setState(INITIAL)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={start} disabled={isActive}>
        <RefreshCw className={cn('size-4', isActive && 'animate-spin')} />
        {isActive ? 'Re-syncing…' : 'Re-sync'}
      </Button>

      {state.phase !== 'idle' && (
        <ResyncBanner state={state} onCancel={cancel} onDismiss={dismiss} />
      )}
    </>
  )
}

function ResyncBanner({
  state,
  onCancel,
  onDismiss,
}: {
  state: State
  onCancel: () => void
  onDismiss: () => void
}) {
  const isActive = state.phase === 'discovering' || state.phase === 'syncing'
  const percent =
    state.phase === 'done'
      ? 100
      : state.total === 0
        ? state.phase === 'discovering'
          ? null // indeterminate
          : 0
        : Math.round((state.done / state.total) * 100)

  // Pick icon + tone
  let Icon = RefreshCw
  let iconClass = 'animate-spin text-[hsl(var(--make-purple))]'
  if (state.phase === 'done' && state.failed === 0) {
    Icon = Check
    iconClass = 'text-[hsl(var(--success))]'
  } else if (state.phase === 'error' || (state.phase === 'done' && state.failed > 0)) {
    Icon = AlertCircle
    iconClass = 'text-[hsl(var(--danger))]'
  }

  return (
    <div
      className="fixed left-1/2 top-[4.5rem] z-40 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-[hsl(var(--make-purple)/0.16)] bg-card p-4 shadow-make-md"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Icon className={cn('size-4 shrink-0', iconClass)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {state.phase === 'discovering' && 'Discovering scenarios from Make…'}
            {state.phase === 'syncing' &&
              `Syncing ${state.done} of ${state.total} scenarios`}
            {state.phase === 'done' && state.failed === 0 && 'Re-sync complete'}
            {state.phase === 'done' && state.failed > 0 && 'Re-sync finished with errors'}
            {state.phase === 'error' && 'Re-sync failed'}
          </p>
          {state.phase === 'syncing' && state.current && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              Processing scenario #{state.current}…
            </p>
          )}
        </div>
        <button
          onClick={isActive ? onCancel : onDismiss}
          className="ring-make-focus -mr-1 grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-foreground"
          aria-label={isActive ? 'Cancel re-sync' : 'Dismiss'}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {state.phase !== 'error' && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          {percent === null ? (
            <div className="h-full w-1/3 animate-pulse bg-make-gradient" />
          ) : (
            <div
              className="h-full bg-make-gradient transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
      )}

      {(state.phase === 'syncing' || state.phase === 'done') && (
        <div className="mt-2 flex items-center gap-4 text-xs">
          <span className="text-[hsl(var(--success))]">✓ {state.success} new</span>
          <span className="text-muted-foreground">↷ {state.skipped} unchanged</span>
          {state.failed > 0 && (
            <span className="text-[hsl(var(--danger))]">✗ {state.failed} failed</span>
          )}
          {state.phase === 'done' && (
            <span className="ml-auto text-muted-foreground">
              {(state.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      )}

      {state.error && <p className="mt-2 text-xs text-[hsl(var(--danger))]">{state.error}</p>}
    </div>
  )
}

interface BatchEvent {
  type: 'start' | 'progress' | 'done' | 'error'
  total?: number
  done?: number
  scenario_id?: string
  status?: string
  error?: string
  summary?: {
    total: number
    success: number
    skipped_hash_match: number
    failed: number
    duration_ms: number
  }
}

async function consumeNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: BatchEvent) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as BatchEvent)
      } catch {
        /* ignore */
      }
    }
  }
  const last = buf.trim()
  if (last) {
    try {
      onEvent(JSON.parse(last) as BatchEvent)
    } catch {
      /* ignore */
    }
  }
}
