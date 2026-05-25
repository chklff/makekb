'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { Sparkles, Send, Paperclip, ExternalLink, Copy, ArrowRightLeft, Scale, GaugeCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatMatchScore } from '@/lib/utils'

interface RetrievedScenario {
  id: string
  make_scenario_id: string
  scenario_name: string
  one_line_summary: string | null
  category: string | null
  complexity: 'simple' | 'medium' | 'complex' | null
  trigger_app: string | null
  apps_involved: string[]
  team_name: string | null
  score: number
}

interface UserTurn {
  kind: 'user'
  content: string
}
interface AssistantTurn {
  kind: 'assistant'
  content: string
  retrieved: RetrievedScenario[]
  streaming: boolean
  error?: string
}
type Turn = UserTurn | AssistantTurn

const SUGGESTIONS = [
  { label: 'Show me webhook scenarios', icon: <GaugeCircle className="size-3.5" /> },
  { label: 'Which scenarios use HubSpot?', icon: <ArrowRightLeft className="size-3.5" /> },
  { label: 'Find data store integrations', icon: <Scale className="size-3.5" /> },
]

export function ChatClient() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new content
  useEffect(() => {
    threadRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [turns])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    setBusy(true)
    setTurns((t) => [...t, { kind: 'user', content: message }, { kind: 'assistant', content: '', retrieved: [], streaming: true }])

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, conversation_id: conversationId ?? undefined }),
      })
      if (!resp.ok || !resp.body) {
        const body = await resp.text().catch(() => '')
        throw new Error(body.slice(0, 200) || `HTTP ${resp.status}`)
      }

      await consumeNdjson(resp.body, (evt) => {
        if (evt.type === 'meta') {
          if (evt.conversation_id) setConversationId(evt.conversation_id)
          setTurns((all) => updateLastAssistant(all, (t) => ({ ...t, retrieved: evt.retrieved ?? [] })))
        } else if (evt.type === 'delta') {
          setTurns((all) => updateLastAssistant(all, (t) => ({ ...t, content: t.content + (evt.text ?? '') })))
        } else if (evt.type === 'done') {
          setTurns((all) => updateLastAssistant(all, (t) => ({ ...t, streaming: false })))
        } else if (evt.type === 'error') {
          setTurns((all) =>
            updateLastAssistant(all, (t) => ({
              ...t,
              streaming: false,
              error: evt.error ?? 'unknown error',
            })),
          )
        }
      })
    } catch (err) {
      setTurns((all) =>
        updateLastAssistant(all, (t) => ({
          ...t,
          streaming: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      )
    } finally {
      setBusy(false)
    }
  }

  // Pure helper — no mutation; safe under React StrictMode double-invocation.
  function updateLastAssistant(all: Turn[], fn: (t: AssistantTurn) => AssistantTurn): Turn[] {
    return all.map((t, i) => (i === all.length - 1 && t.kind === 'assistant' ? fn(t) : t))
  }

  return (
    <div className="space-y-6">
      {/* Empty state */}
      {turns.length === 0 && (
        <Card className="border-[hsl(var(--make-purple)/0.12)] bg-[hsl(var(--make-purple)/0.04)] p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-make-gradient text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Ask anything about your scenarios</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try one of these, or ask in your own words:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => send(s.label)}
                    className="ring-make-focus inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--make-purple)/0.2)] bg-white px-3 py-1.5 text-xs text-[hsl(var(--make-purple))] transition-colors hover:bg-[hsl(var(--make-purple)/0.06)]"
                  >
                    {s.icon}
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Thread */}
      <div ref={threadRef} className="space-y-6">
        {turns.map((t, i) =>
          t.kind === 'user' ? <UserMessage key={i} content={t.content} /> : <AssistantMessage key={i} turn={t} />,
        )}
      </div>

      {/* Input pinned bottom */}
      <div className="sticky bottom-4 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--make-purple)/0.16)] bg-card p-2 shadow-make-md"
        >
          <button
            type="button"
            aria-label="Attach"
            className="ring-make-focus grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-[hsl(var(--make-purple)/0.06)]"
            disabled
          >
            <Paperclip className="size-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your scenarios…"
            disabled={busy}
            className="ring-make-focus flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <Button variant="gradient" size="icon" type="submit" disabled={busy || !input.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          KB uses AI. Results may be incomplete. Verify important details.
        </p>
      </div>
    </div>
  )
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[hsl(var(--make-purple)/0.08)] px-4 py-3 text-sm text-foreground">
        {content}
      </div>
    </div>
  )
}

function AssistantMessage({ turn }: { turn: AssistantTurn }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-make-gradient text-white">
          <Sparkles className="size-4" />
        </div>
        <div className="flex-1 space-y-2 text-sm leading-relaxed text-foreground">
          {turn.content === '' && turn.streaming ? (
            <div className="flex items-center gap-1 py-1 text-muted-foreground">
              <span className="size-1.5 animate-bounce rounded-full bg-[hsl(var(--make-purple))]" style={{ animationDelay: '0ms' }} />
              <span className="size-1.5 animate-bounce rounded-full bg-[hsl(var(--make-purple))]" style={{ animationDelay: '150ms' }} />
              <span className="size-1.5 animate-bounce rounded-full bg-[hsl(var(--make-purple))]" style={{ animationDelay: '300ms' }} />
              <span className="ml-2 text-xs">searching…</span>
            </div>
          ) : (
            renderWithCitations(turn.content, turn.retrieved.length)
          )}
          {turn.error && (
            <p className="text-xs text-[hsl(var(--danger))]">{turn.error}</p>
          )}
        </div>
      </div>

      {turn.retrieved.length > 0 && (
        <section className="ml-11 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top matching scenarios
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {turn.retrieved.map((r, i) => (
              <SourceCard key={r.id} index={i + 1} scenario={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function renderWithCitations(text: string, citationCount: number) {
  // Match [1], [2], etc.; render as pill if index ≤ citationCount.
  const parts: React.ReactNode[] = []
  const re = /\[(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    const idx = Number(m[1])
    if (m.index > last) parts.push(<Fragment key={`t${key++}`}>{text.slice(last, m.index)}</Fragment>)
    if (idx >= 1 && idx <= citationCount) {
      parts.push(
        <a
          key={`c${key++}`}
          href={`#src-${idx}`}
          className="ring-make-focus mx-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-make-gradient px-1 text-[11px] font-medium leading-none text-white"
        >
          [{idx}]
        </a>,
      )
    } else {
      parts.push(<Fragment key={`raw${key++}`}>{m[0]}</Fragment>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<Fragment key={`t${key++}`}>{text.slice(last)}</Fragment>)
  return <p className="whitespace-pre-wrap">{parts}</p>
}

function SourceCard({ index, scenario }: { index: number; scenario: RetrievedScenario }) {
  const { pct, tier } = formatMatchScore(scenario.score)
  const tierClass =
    tier === 'high' ? 'pill-score-high' : tier === 'mid' ? 'pill-score-mid' : 'pill-score-low'
  // Dedupe — trigger_app is typically also in apps_involved, so naive concatenation
  // produces duplicates that React rejects as non-unique keys.
  const chips = Array.from(
    new Set(
      [
        scenario.team_name,
        scenario.category,
        scenario.trigger_app,
        ...scenario.apps_involved.slice(0, 2),
      ].filter(Boolean) as string[],
    ),
  )

  return (
    <Card id={`src-${index}`} className="scroll-mt-24">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-make-gradient text-[11px] font-medium text-white">
              {index}
            </span>
            <CardTitle className="text-sm">{scenario.scenario_name}</CardTitle>
          </div>
          <span className={cn(tierClass, 'shrink-0')}>{pct} match</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {scenario.one_line_summary && (
          <p className="text-xs text-muted-foreground">{scenario.one_line_summary}</p>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Badge key={c} variant="secondary" className="text-[11px]">
                {c}
              </Badge>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/scenarios/${scenario.id}`}>
              <ExternalLink className="size-3.5" />
              Open
            </Link>
          </Button>
          <Button variant="gradient" size="sm" asChild>
            <Link href={`/scenarios/${scenario.id}?adapt=1`}>
              <Copy className="size-3.5" />
              Reuse
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface ChatEvent {
  type: 'meta' | 'delta' | 'done' | 'error'
  conversation_id?: string
  retrieved?: RetrievedScenario[]
  text?: string
  error?: string
}

async function consumeNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: ChatEvent) => void) {
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
        onEvent(JSON.parse(line) as ChatEvent)
      } catch {
        /* ignore */
      }
    }
  }
  const last = buf.trim()
  if (last) {
    try {
      onEvent(JSON.parse(last) as ChatEvent)
    } catch {
      /* ignore */
    }
  }
}
