'use client'

import { useState, useEffect } from 'react'
import { Sparkles, AlertTriangle, Download, ExternalLink, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface VariantResult {
  new_blueprint: Record<string, unknown>
  change_summary: string[]
  warnings: string[]
  llm_model_used: string
  estimated_cost_usd: number
  duration_ms: number
}

interface Props {
  scenarioId: string
  scenarioName: string
  autoOpen?: boolean
}

export function AdaptPanel({ scenarioId, scenarioName, autoOpen = false }: Props) {
  const [request, setRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VariantResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (autoOpen) {
      // Scroll the panel into view + focus the textarea.
      const ta = document.getElementById('adapt-textarea') as HTMLTextAreaElement | null
      if (ta) {
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => ta.focus(), 400)
        setFocused(true)
      }
    }
  }, [autoOpen])

  async function generate() {
    if (!request.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const resp = await fetch('/api/reuse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source_scenario_id: scenarioId, modification_request: request }),
      })
      const body = (await resp.json()) as VariantResult & { error?: string; message?: string }
      if (!resp.ok) {
        throw new Error(body.message ?? body.error ?? `HTTP ${resp.status}`)
      }
      setResult(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function downloadJson() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result.new_blueprint, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${scenarioName.replace(/[^\w-]+/g, '-')}-variant.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Card
        className={
          focused
            ? 'border-[hsl(var(--make-purple)/0.4)] bg-[hsl(var(--make-pink-tint)/1)] shadow-make-md'
            : 'border-[hsl(var(--make-purple)/0.2)] bg-[hsl(var(--make-pink-tint)/1)]'
        }
        id="adapt-panel"
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-[hsl(var(--make-purple))]" />
              Adapt with AI
            </span>
            <Badge variant="default" className="text-[10px]">
              Beta
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Describe the changes you want and AI will create a variant blueprint you can review
            before importing into Make.
          </p>
          <textarea
            id="adapt-textarea"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="e.g. swap HubSpot for Pipedrive, keep everything else the same"
            rows={4}
            maxLength={1000}
            disabled={loading}
            className="ring-make-focus block w-full resize-none rounded-md border border-[hsl(var(--make-purple)/0.2)] bg-white p-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{request.length}/1000</span>
            <Button
              variant="gradient"
              size="sm"
              onClick={generate}
              disabled={loading || !request.trim()}
            >
              <Sparkles className={loading ? 'size-4 animate-pulse' : 'size-4'} />
              {loading ? 'Generating…' : 'Generate variant'}
            </Button>
          </div>
          {error && (
            <p className="rounded-md border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.06)] p-2 text-xs text-[hsl(var(--danger))]">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <VariantResultCard
          scenarioName={scenarioName}
          result={result}
          onDownload={downloadJson}
          onReset={() => {
            setResult(null)
            setRequest('')
          }}
        />
      )}
    </>
  )
}

function VariantResultCard({
  scenarioName,
  result,
  onDownload,
  onReset,
}: {
  scenarioName: string
  result: VariantResult
  onDownload: () => void
  onReset: () => void
}) {
  return (
    <Card className="border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.05)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
          <Sparkles className="size-4" />
          Variant ready for review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Generated in {(result.duration_ms / 1000).toFixed(1)}s by {result.llm_model_used} ·
          cost ${result.estimated_cost_usd.toFixed(3)}
        </p>

        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Changes ({result.change_summary.length})
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {result.change_summary.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-[hsl(var(--make-purple))]" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>

        {result.warnings.length > 0 && (
          <section className="rounded-md border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] p-3">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--warning))]">
              <AlertTriangle className="size-3.5" />
              Review before importing ({result.warnings.length})
            </p>
            <ul className="mt-2 space-y-1 text-sm text-foreground/90">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[hsl(var(--warning))]" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="rounded-md border border-[hsl(var(--make-purple)/0.12)] bg-white">
          <summary className="cursor-pointer p-2 text-xs font-medium hover:bg-[hsl(var(--make-purple)/0.04)]">
            Preview blueprint JSON
          </summary>
          <pre className="max-h-72 overflow-auto p-2 font-mono text-[11px] leading-snug">
            {JSON.stringify(result.new_blueprint, null, 2)}
          </pre>
        </details>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="gradient" size="sm" onClick={onDownload}>
            <Download className="size-4" />
            Download blueprint
          </Button>
          <Button variant="outline" size="sm" disabled title="Direct import to Make is v1.5">
            <ExternalLink className="size-4" />
            Import to Make
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Direct import to Make lands in v1.5. For now: download → create a new scenario in Make →
          paste the blueprint.
        </p>

        <button
          onClick={onReset}
          className="ring-make-focus text-[11px] text-muted-foreground hover:text-foreground"
        >
          ← Adapt again with a different request
        </button>
      </CardContent>
    </Card>
  )
  // Suppress unused warning for scenarioName (kept in signature for future export-naming)
  void scenarioName
}
