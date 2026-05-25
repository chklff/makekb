# Scenario KB for Make.com

A semantic knowledge base over your Make.com scenarios.

- **Ask in plain English** — "do we already have a scenario that syncs HubSpot deals to Facebook CAPI?" — get a grounded answer with citations
- **Browse + filter** — search by app, team, complexity, match score
- **Adapt with AI** — "swap HubSpot for Pipedrive, keep everything else" → downloadable variant blueprint
- **One sync button** — pull the latest scenarios from Make, hash-deduped so re-syncs are cheap

Built for internal company use. Self-hosted on Vercel + Supabase. ~$60/month all-in for a 500-scenario org.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend / API | Next.js 15 App Router · React 19 · TypeScript (strict) |
| Database + Auth + Storage | Supabase (Postgres, pgvector with HNSW, Google OAuth) |
| LLM analysis + reuse | Anthropic Claude Sonnet 4.5 |
| LLM chat | Anthropic Claude Haiku 4.5 |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| UI | Tailwind + shadcn/ui + lucide-react, Make brand palette |
| Tests | Vitest |
| Package manager | pnpm 9+ |
| Node | 20 LTS (also runs on 22, 24) |

---

## What you need before you start

Five accounts. Free tiers are fine to evaluate, paid for real use.

1. **Make.com** — an account with at least one organization. You need an API token (Profile → API/MCP Access → Token) with these scopes:
   - `organizations:read`, `teams:read`, `scenarios:read`, `scenarios-folders:read`
2. **Supabase** — a fresh project. Note the project URL and the `service_role` + `anon` keys.
3. **Anthropic** — API key, with access to `claude-sonnet-4-5` and `claude-haiku-4-5`.
4. **OpenAI** — API key, with the `text-embedding-3-small` model enabled in your project's allowed-models list.
5. **Google Cloud Console** — for OAuth (Supabase Auth federates to Google). You'll create an OAuth Client ID.

Budget for the LLM costs:
- Ingesting 500 scenarios end-to-end: ~$16 one-time
- Monthly re-sync (assuming ~10% change): ~$2
- Per chat message (Haiku): ~$0.005
- Per "Adapt with AI" call (Sonnet): ~$0.05

---

## Install — from `git clone` to your first answer

Six steps. ~20 minutes total.

### 1. Clone + install

```bash
git clone <this-repo> scenario-kb
cd scenario-kb
pnpm install
```

### 2. Configure env

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```bash
# Supabase (dashboard → Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Postgres direct URL (dashboard → Project Settings → Database → Connection string,
# select "Direct connection", NOT pooler). Only used by scripts/setup-db.ts.
DATABASE_URL=postgresql://postgres:[password]@db.<project>.supabase.co:5432/postgres

# LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...

# Make
MAKE_API_TOKEN=...
MAKE_API_BASE_URL=https://eu1.make.com/api/v2     # or https://us1.make.com/api/v2
MAKE_DEFAULT_ORG_ID=12345                          # your Make org's numeric id

# Optional — leave defaults unless you know better
LLM_MODEL_ANALYSIS=claude-sonnet-4-5-20250929
LLM_MODEL_CHAT=claude-haiku-4-5-20251001
LLM_MODEL_REUSE=claude-sonnet-4-5-20250929
EMBEDDING_MODEL=text-embedding-3-small
PROMPT_VERSION=v1.0
```

### 3. Apply DB migrations to Supabase

```bash
pnpm db:setup
```

This runs every file in `supabase/migrations/` in order. ~10 migrations: HNSW vector index, FTS column, all reference tables, RLS + 18 policies, the `search_scenarios` RPC, observability views.

### 4. Enable Google OAuth in Supabase

Two dashboards, one-time:

**Google Cloud Console** → `https://console.cloud.google.com/apis/credentials`
- Create OAuth Client ID → **Web application**
- Authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
- Copy the Client ID + Client Secret

**Supabase dashboard** → `Authentication → Providers → Google`
- Enable, paste the Client ID + Secret, save
- Then `Authentication → URL Configuration`:
  - **Site URL**: `http://localhost:3000` (development) or your production URL
  - **Redirect URLs**: add `http://localhost:3000/api/auth/callback`

### 5. Sign in once

```bash
pnpm dev
```

Open `http://localhost:3000/sign-in`, click **Continue with Google**. You'll land on the app showing **"No org access yet"** — that's expected. You now have an `auth.users` row but no org membership.

### 6. Bootstrap your admin membership

```bash
pnpm tsx scripts/grant-user-org-access.ts \
  --email=you@company.com \
  --make_org_id=12345 \
  --role=admin
```

Refresh the browser. You're now an admin of the org. The **Re-sync** button appears in the top bar.

**Easier path for onboarding teammates** — set these env vars and any matching sign-in auto-grants on first login (no script needed per user). Target org is `MAKE_DEFAULT_ORG_ID`.

```bash
AUTO_GRANT_DOMAINS=yourcompany.com           # anyone @yourcompany.com → member
AUTO_GRANT_ADMIN_EMAILS=you@gmail.com        # specific people → admin (any domain)
```

Admin emails are checked **first** and work for **any** domain — a personal Gmail in `AUTO_GRANT_ADMIN_EMAILS` gets in even if `gmail.com` isn't in `AUTO_GRANT_DOMAINS`. Existing memberships are never overwritten. Users matching neither rule still see "No org access yet."

### 7. Ingest your scenarios

For a first-time backfill of more than ~30 scenarios, **always run locally** rather than via the UI button:

```bash
pnpm ingest:backfill --limit=10     # smoke test
pnpm ingest:backfill                # the whole org
```

Why local? The CLI bypasses HTTP timeouts and uses parallel workers. ~6 seconds per scenario, ~$0.03 each. A 500-scenario org takes ~10 minutes and costs ~$16.

Once you're past the first backfill, the **Re-sync** button in the UI handles ad-hoc top-ups (up to 50 scenarios at a time) with a live progress bar.

---

## Day-to-day usage

### `/chat` — ask anything

> "do we have a scenario that syncs HubSpot deals to Facebook CAPI?"

Returns a streaming answer with inline `[1]` `[2]` citation pills + source cards. Click **Reuse** on any card → lands on the detail page with the Adapt panel auto-focused.

### `/browse` — see everything

- Free-text search (semantic + full-text), debounced
- Filter chips: Team / App / Category / Complexity
- Match-score slider when searching: only show results ≥ X%
- URL-shareable: `/browse?q=webhook&app=gateway&complexity=simple`

### `/scenarios/[id]` — detail + adapt

Two-column page:
- **Left**: business purpose, data flow (step-by-step), branches, error handling, **Reuse notes** (the warning-amber block that tells you what to change)
- **Right**: actions (Open in Make, Adapt), the **Adapt with AI** panel, at-a-glance metadata, tags

In the Adapt panel: describe a change ("swap HubSpot for Pipedrive"), click **Generate variant**. Sonnet 4.5 returns a new valid Make.com blueprint JSON + change summary + warnings about what you should review before importing. Download → import into Make.

### Re-sync (admin only)

Top bar → **Re-sync** button. Pulls scenarios from Make, ingests new/changed ones (hash-deduped, so unchanged scenarios skip the LLM call). Live progress bar shows what's happening.

For a folder-scoped sync from the terminal:

```bash
pnpm ingest:backfill --folder=305301        # only that folder's scenarios
pnpm ingest:backfill --team=741328          # only that team
pnpm ingest:backfill --scenario=4594302     # one specific scenario
```

---

## Scripts reference

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (Next.js config) |
| `pnpm test` | Vitest unit tests |
| `pnpm db:setup` | Apply all SQL migrations to your Supabase project |
| `pnpm db:types` | Regenerate `lib/supabase/types.ts` from the live schema |
| `pnpm ingest:backfill` | Bulk-ingest scenarios. Flags: `--limit`, `--team`, `--folder`, `--scenario`, `--concurrency` |
| `pnpm tsx scripts/refresh-meta.ts` | Update org/team/folder names from Make (no LLM cost) |
| `pnpm tsx scripts/grant-user-org-access.ts --email=… --make_org_id=… [--role=admin]` | Bootstrap user → org membership |
| `pnpm tsx scripts/test-search.ts "<query>"` | Smoke-test retrieval from CLI |
| `pnpm tsx scripts/test-reuse.ts <uuid> "<request>"` | Smoke-test the Adapt pipeline |

---

## Project layout

```
app/
  (auth)/sign-in/                Google OAuth surface
  (app)/                         Protected routes (require session)
    chat/                        Streaming chat with citations
    browse/                      Search + filters + match slider
    scenarios/[id]/              Detail page + Adapt panel
  api/
    auth/                        Supabase OAuth callback + sign-out
    chat/                        POST, NDJSON-streaming RAG answer
    search/                      POST, hybrid retrieval (vector + FTS)
    reuse/                       POST, Sonnet variant generation
    ingest/scenario|batch|…/     Ingestion endpoints (admin)
    health/                      Public

components/
  ui/                            shadcn primitives (Button, Card, Input, Badge)
  app-shell/                     TopBar, Sidebar, ResyncButton, UserMenu
  brand/                         MakeLogo

lib/
  supabase/{server,client,service}.ts    Three client factories, RLS-scoped
  llm/                           Anthropic + OpenAI wrappers, prompts, cost tracking
  make/                          Make.com API client + blueprint cleaner
  ingest/run-scenario.ts         Shared core: fetch → clean → analyze → embed → upsert
  retrieval/hybrid-search.ts     Wraps the search_scenarios SQL RPC
  auth/                          Session + admin guards + user-context loader
  utils/                         Hash, logger, errors, assert-server

supabase/
  migrations/                    11 SQL files, idempotent via pnpm db:setup
  config.toml                    (unused at runtime; CLI metadata)

scripts/
  setup-db.ts                    Migration runner
  backfill.ts                    Bulk ingest
  refresh-meta.ts                Org/team/folder name refresh
  grant-user-org-access.ts       Membership bootstrap
  test-search.ts | test-reuse.ts CLI smoke tests
  generate-types.sh              Regenerate Supabase types

tests/
  unit/clean-blueprint.test.ts
  unit/hash.test.ts

docs/archive/                    Original planning specs (Build-Brief, AI-Architecture)
```

---

## Architecture in one paragraph

The LLM is the reader, the database is the librarian, the vector is the index card. Blueprints are fetched from Make, surgically cleaned (strip designer/parameter bloat, keep mapper/filter/restore), sent to Claude Sonnet 4.5 which returns a structured JSON analysis (one-line summary, business purpose, data flow, branches, error handling, reuse notes, apps, tags, category, trigger, complexity). The analysis is embedded with OpenAI `text-embedding-3-small` and stored in Postgres alongside the raw JSON + a SHA-256 hash. Queries hit a hybrid retrieval RPC (vector cosine + FTS rank, weighted 0.7/0.3) with optional pre-filters on apps/category/team/complexity. Re-syncs are cheap because the hash check skips analysis when nothing changed (unless `PROMPT_VERSION` bumps).

Full rationale: `DECISIONS.md`. Original planning docs in `docs/archive/`.

---

## Troubleshooting

### "OPENAI_API_KEY is not set" in API routes
The OpenAI / Anthropic SDKs are now lazy-initialized in `lib/llm/*.ts`. If you still see this, your `.env.local` isn't being loaded by Next.js. Make sure the file is in the project root (not a subdirectory) and restart `pnpm dev`.

### "403 Project does not have access to model `text-embedding-3-small`"
Your OpenAI project's allowed-models list doesn't include embeddings. Fix at https://platform.openai.com/settings/organization/projects → your project → **Limits** → enable the model.

### "permission denied for table ingestion_runs"
The `service_role` grant migration didn't run. Re-run `pnpm db:setup` — migration `20260521000011_grant_service_role_privileges.sql` adds it.

### "No org access yet" after sign-in
Expected on first login. Run `pnpm tsx scripts/grant-user-org-access.ts --email=… --make_org_id=… --role=admin`, then refresh.

### Adapt panel says "blueprint_in_storage"
The scenario's blueprint is >500KB and was offloaded to Supabase Storage. v1 doesn't fetch from Storage for Adapt; inspect the original in Make. v1.5 will handle this.

### "url.parse() deprecation warning" floods the console
Harmless — a transitive dep uses the legacy API on Node 22+. The `pnpm dev` script already suppresses it via `NODE_OPTIONS=--no-deprecation`. If you ran via plain `next dev` you'll see it.

### Re-sync shows "N failed" with no detail
Check `ingestion_runs` in Supabase:

```sql
SELECT status, error_message, scenario_id
FROM ingestion_runs
WHERE started_at > now() - interval '10 minutes' AND status LIKE 'failed%';
```

---

## Cost estimate (real numbers)

For a 500-scenario org, moderate usage:

| Item | Per month |
|---|---|
| Monthly re-ingest (10% drift) | ~$1.60 |
| 200 chat msgs/day (Haiku) | ~$30 |
| 5 reuse generations/day (Sonnet) | ~$9 |
| Supabase Pro | $25 |
| Vercel Pro (if you need it for `maxDuration: 300`) | $20 |
| **Total** | **~$85/month** |

One-time:
- 500-scenario initial backfill: ~$16

For a 50-scenario org, divide by ~10.

---

## Roadmap

See `PLAN.md` for milestone status. Currently at end of M3.5 — chat + reuse + browse all working.

Open backlog (v1.5):
- Pattern clustering (the second-order layer — once you have 100+ scenarios)
- Multi-tenant invite flow (currently: admin grants via script)
- Conversation history sidebar (the "History" button is decorative)
- Direct import-to-Make from the Adapt panel (currently: download JSON, paste in Make)
- Folder picker on the Re-sync UI button (currently: CLI only)

---

## Contributing

If you're an engineer extending this repo, read `AGENTS.md` first — it captures the operating rules (when to update which doc, the "always end with a test plan" rule, etc.). Then check `DECISIONS.md` for the locked architectural choices and `PLAN.md` / `TASKS.md` for what's actually in flight.

All design rationale and the why-not behind alternatives lives in `DECISIONS.md`. The historical Build-Brief + AI-Architecture (pre-implementation specs) are archived in `docs/archive/`.

---

## License

[BSD 3-Clause](./LICENSE) — permissive, attribution-required. Copyright © 2026 Make.com.
