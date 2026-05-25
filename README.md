# Scenario KB for Make.com

A semantic knowledge base over your Make.com scenarios.

- **Ask in plain English** — "do we already have a scenario that syncs HubSpot deals to Facebook CAPI?" — get a grounded answer with citations
- **Browse + filter** — search by app, team, complexity, match score
- **Adapt with AI** — "swap HubSpot for Pipedrive, keep everything else" → downloadable variant blueprint
- **One sync button** — pull the latest scenarios from Make, hash-deduped so re-syncs are cheap

Built for internal company use. Self-hosted on Vercel + Supabase. ~$60/month all-in for a 500-scenario org.

---

## Screenshots

**Ask KB — chat with grounded citations**

![Ask KB chat surface](docs/screenshots/chat.png)

**Browse — search + filter chips + match-score slider**

![Browse with filters](docs/screenshots/browse.png)

**Scenario detail + Adapt with AI**

![Scenario detail](docs/screenshots/detail.png)

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

`.env.example` is the source of truth — open `.env.local` and fill in the values it lists. The required keys:

```bash
# Supabase (dashboard → Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Direct Postgres connection (dashboard → Project Settings → Database → Connection
# string → "Direct connection", NOT pooler). Only used by `pnpm db:setup`.
DATABASE_URL=postgresql://postgres:[password]@db.<project>.supabase.co:5432/postgres

# LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...

# Make
MAKE_API_TOKEN=...
MAKE_API_BASE_URL=https://eu1.make.com/api/v2     # or https://us1.make.com/api/v2
MAKE_WEB_BASE_URL=https://eu1.make.com            # for "Open in Make" links; match region above
MAKE_DEFAULT_ORG_ID=12345                          # your Make org's numeric id
```

Optional (covered in `.env.example` with defaults that work out of the box):
- Pinned model versions (`LLM_MODEL_*`, `EMBEDDING_MODEL`, `PROMPT_VERSION`)
- Daily spend caps (`DAILY_LLM_BUDGET_USD`, `DAILY_EMBEDDING_BUDGET_USD`)
- Auto-grant on first sign-in (`AUTO_GRANT_DOMAINS`, `AUTO_GRANT_ADMIN_EMAILS`) — see step 6
- Feedback email override (`NEXT_PUBLIC_FEEDBACK_EMAIL`)
- Server log verbosity (`LOG_LEVEL`)
- Ingest concurrency (`INGEST_CONCURRENCY`)

### 3. Apply DB migrations to Supabase

```bash
pnpm db:setup
```

This runs every file in `supabase/migrations/` in order. HNSW vector index, FTS column, all reference tables, RLS + 18 policies, the `search_scenarios` RPC, observability views, `llm_call_log` for budget tracking, chat-retention pg_cron job.

### 4. Enable Google OAuth in Supabase

Two dashboards, one-time. The trick: **Google** only cares about the Supabase callback. **Supabase** is what redirects back to your app — so your app URL goes in Supabase, not Google.

**Google Cloud Console** → `https://console.cloud.google.com/apis/credentials`
- Create OAuth Client ID → **Web application**
- Authorized JavaScript origins: leave empty (Supabase doesn't need it)
- **Authorized redirect URI** (the only one Google needs):
  `https://<your-supabase-project>.supabase.co/auth/v1/callback`
- Copy the Client ID + Client Secret

**Supabase dashboard** → `Authentication → Providers → Google`
- Enable, paste the Client ID + Secret, save

**Supabase dashboard** → `Authentication → URL Configuration`
- **Site URL**: `http://localhost:3000` (you'll change this once you deploy — see [Deploy to production](#deploy-to-production))
- **Redirect URLs** (whitelist — add all that apply):
  - `http://localhost:3000/api/auth/callback` (local dev)
  - `https://<your-production-domain>/api/auth/callback` (after deploy)
  - `https://<vercel-preview-pattern>.vercel.app/api/auth/callback` (optional — for preview branches; pattern supports wildcards like `https://makekb-*-yourorg.vercel.app/api/auth/callback`)

If you skip the Redirect URLs whitelist step, Supabase will reject the OAuth callback and you'll land on the sign-in page in a loop with no error visible to the user.

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

## Deploy to production

1. Push repo to GitHub, import into Vercel. Framework: Next.js (auto-detected).
2. Vercel → Settings → Environment Variables: paste your `.env.local` except `DATABASE_URL`. Deploy.
3. (Optional) Add a custom domain in Vercel → Settings → Domains.
4. **Critical:** Supabase → Authentication → URL Configuration:
   - Site URL = your prod URL
   - Redirect URLs: add `https://<your-prod-url>/api/auth/callback` (keep `http://localhost:3000/api/auth/callback` too)
5. Set hard monthly caps in Anthropic + OpenAI dashboards as a second layer beyond `DAILY_LLM_BUDGET_USD`.

**Access control:** only emails matching `AUTO_GRANT_DOMAINS` get org membership — everyone else hits "No org access yet" and sees nothing. Google Cloud Console doesn't need updating: Google only sees the Supabase callback.

**Vercel Pro** ($20/mo) needed only if `/api/ingest/batch` hits the free-tier 10s timeout (it's set to 300s).

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
  migrations/                    SQL migrations, idempotent via pnpm db:setup
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

The LLM is the reader, the database is the librarian, the vector is the index card. Blueprints are fetched from Make alongside the author's free-text `description` (from scenario settings) and the `/scenarios/{id}/interface` payload (webhook + sub-scenario I/O). The blueprint is surgically cleaned (strip designer/parameter bloat, keep mapper/filter/restore) and sent to Claude Sonnet 4.5 along with the human description as the highest-trust intent signal. Sonnet returns a structured JSON analysis (one-line summary, business purpose, data flow, branches, error handling, reuse notes, apps, tags, category, trigger, complexity). The analysis text is embedded with OpenAI `text-embedding-3-small` — when a human description exists it's prepended twice so the author's own words dominate the vector. Stored in Postgres alongside the raw JSON + a SHA-256 hash. Queries hit a hybrid retrieval RPC (vector cosine + FTS rank, weighted 0.7/0.3) with optional pre-filters on apps/category/team/complexity. Re-syncs are cheap because the hash check skips analysis when nothing changed (unless `PROMPT_VERSION` bumps).

Full rationale: `DECISIONS.md`. Original planning docs in `docs/archive/`.

---

## Security defaults (what's already on for you)

You're not getting a naked Next.js app — there's defense-in-depth built in:

- **Row Level Security** on every public table. Users can only read their own org's data; admins can only read the orgs they're members of.
- **Per-user rate limits** on `/api/chat` (30/min), `/api/reuse` (5/min), `/api/search` (60/min). Returns 429 with `Retry-After` header when exceeded.
- **Daily spend caps** (`DAILY_LLM_BUDGET_USD` + `DAILY_EMBEDDING_BUDGET_USD`) enforced before every paid LLM call. Counts chat + reuse + ingestion together. Defense-in-depth — also set hard caps in the Anthropic + OpenAI dashboards.
- **Prompt-injection sanitization** on retrieved scenario content before it's inlined into the chat system prompt.
- **Content-Security-Policy + 5 other security headers** on every response (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- **Storage `blueprints` bucket** is private with a 10MB file cap.
- **Chat history retention**: nightly pg_cron job deletes `chat_messages` older than 90 days and cascades empty conversations.
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, etc.) are server-only — never exposed to the browser bundle.

Accepted limitations and the full second-pass security review are in `DECISIONS.md` → "Accepted security risks for v1."

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

### "429 rate_limited" from `/api/chat` or `/api/reuse`
Working as intended — per-user sliding-window limits are tuned for normal use. The response includes a `Retry-After: <seconds>` header. If you genuinely need higher limits, edit `lib/rate-limit.ts` (look for `limit: 30` / `limit: 5` in the route handlers).

### "BudgetExceededError" on LLM calls
You've hit the daily cap (`DAILY_LLM_BUDGET_USD`, default $20). Check today's spend:

```sql
SELECT
  (SELECT COALESCE(SUM(llm_cost_usd), 0) FROM ingestion_runs WHERE started_at::date = current_date) AS ingest_usd,
  (SELECT COALESCE(SUM(cost_usd), 0) FROM llm_call_log WHERE created_at::date = current_date) AS chat_reuse_usd;
```

Raise the env var if real, or wait until UTC midnight rollover. The internal memoization caches the budget status for 60s, so it can take that long after a config change to see the new ceiling.

### CSP violations in browser console
If you customize the app to load external resources (e.g. an analytics SDK, a fonts CDN), update `next.config.mjs` → `cspDirectives` to allow them. Dev mode already relaxes the policy enough for Turbopack HMR.

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
