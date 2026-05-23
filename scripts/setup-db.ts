#!/usr/bin/env -S tsx
/**
 * Apply every SQL file in supabase/migrations/ against a Supabase Postgres database,
 * in alphabetical order. Idempotent for already-applied migrations *only if* you also
 * have the supabase CLI bound and `migrations` table tracking — this minimal helper
 * does NOT track applied migrations. It's intended for FRESH installs only.
 *
 * For a fresh company install:
 *   1. Create a new Supabase project
 *   2. Set DATABASE_URL in .env.local to the project's "Connection string > Direct"
 *      (NOT the pooler — pooler doesn't support multi-statement transactions)
 *   3. Run: pnpm db:setup
 *
 * Usage:
 *   pnpm db:setup                          # applies every migration
 *   pnpm db:setup --dry-run                # prints what it would do
 *   pnpm db:setup --only=20260521000001    # one specific migration
 */
import './_load-env'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface Args {
  dryRun: boolean
  only?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false }
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true
    const m = a.match(/^--only=(.+)$/)
    if (m) args.only = m[1]
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL is required in .env.local. Get it from Supabase dashboard → Project Settings → Database → Connection string (Direct, NOT pooler).',
    )
  }

  const dir = resolve(process.cwd(), 'supabase/migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !args.only || f.includes(args.only))

  console.info(`▶ Found ${files.length} migration file(s) in ${dir}`)
  if (args.dryRun) {
    for (const f of files) console.info(`  (dry-run) would apply: ${f}`)
    return
  }

  // Lazy import postgres to keep this script's footprint small.
  // Not in dependencies — installed on demand for the fresh-install flow:
  //   pnpm add postgres
  // Suppress TS module-resolution since the package is optional.
  // @ts-expect-error optional dep installed by `pnpm add postgres` before running setup
  const mod = (await import('postgres').catch(() => null)) as { default: (url: string, opts: { onnotice: () => void }) => { unsafe: (q: string) => Promise<unknown>; end: (opts: { timeout: number }) => Promise<void> } } | null
  if (!mod) throw new Error('postgres package not installed. Run: pnpm add postgres')
  const sql = mod.default(dbUrl, { onnotice: () => {} })

  try {
    for (const f of files) {
      const path = resolve(dir, f)
      const content = readFileSync(path, 'utf8')
      console.info(`▶ Applying ${f} (${content.length} bytes)…`)
      await sql.unsafe(content)
      console.info(`  ✓ ${f}`)
    }
    console.info('▶ All migrations applied successfully.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('Setup fatal:', err)
  process.exit(1)
})
