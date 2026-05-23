// Load env vars the same way Next.js does:
//   .env.local overrides .env (if both exist).
//
// Used by all scripts: `import './_load-env'` MUST be the FIRST import in any script
// that touches process.env-dependent modules (Supabase clients, OpenAI, Anthropic).

import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
for (const file of ['.env', '.env.local']) {
  const p = resolve(root, file)
  if (existsSync(p)) config({ path: p, override: true })
}
