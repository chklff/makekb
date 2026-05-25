// /changelog — Server Component. Reads CHANGELOG.md from the repo root at request
// time and renders it inside the app shell. Sidebar version label links here.
//
// Why filesystem read rather than `import`? Next.js doesn't have a markdown loader
// by default, and we want CHANGELOG.md to stay the canonical file at repo root
// (GitHub renders it natively). Single source of truth.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { APP_VERSION } from '@/lib/utils/version'

export const dynamic = 'force-dynamic'

function loadChangelog(): string {
  try {
    return readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8')
  } catch {
    return `# Changelog\n\n_CHANGELOG.md not found at repo root._`
  }
}

export default function ChangelogPage() {
  const md = loadChangelog()

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/chat">
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-[hsl(var(--make-purple)/0.08)] text-[hsl(var(--make-purple))]">
          <FileText className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tighter">Changelog</h1>
          <p className="text-xs text-muted-foreground">
            You&apos;re running <span className="font-mono">v{APP_VERSION}</span>
          </p>
        </div>
      </header>

      <Card className="p-6">
        <article className="changelog-prose text-sm text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </article>
      </Card>
    </div>
  )
}
