# Make Scenarios KB — Build Brief for Claude Code

> 📜 **ARCHIVED — May 2026.** This was the original 1600-line prescriptive spec, written before implementation started. Current state lives in the project root. See `/docs/archive/README.md` for the overview.

**Purpose:** This document is the complete technical brief for Claude Code (Opus 4.7, high thinking, plan mode) to plan and build the Make Scenarios Knowledge Base.

**Read this in conjunction with:**
- `AI-Architecture.md` — the architecture rationale
- `UI-Recommendations.md` — the UI mockups and decisions

**This document tells you WHAT to build, in detail. The companion docs tell you WHY.**

---

## 0. TL;DR for the planner

Build a **Next.js 15 App Router** application in **TypeScript** that:

1. Ingests Make.com scenario blueprints, sends them to Claude Sonnet 4.5 for analysis, embeds the result with OpenAI, stores everything in **Supabase Postgres + pgvector**.
2. Exposes a **chat / search / reuse** UI for users (Google SSO via Supabase Auth).
3. Runs **batch ingestion** via **Supabase Edge Functions** (Deno) triggered by `pg_cron`.
4. Enforces **Row Level Security** so users only see scenarios their email's Make org owns.

**Hard constraints — do not deviate without asking:**

- Stack: Next.js 15 + TS + Supabase + Edge Functions + pgvector. No other databases, no separate vector store, no Python.
- Auth: Supabase Auth with Google OAuth. No NextAuth, no Clerk, no custom JWT.
- LLM provider for analysis & reuse: **Anthropic Claude Sonnet 4.5**.
- LLM provider for chat & query understanding: **Anthropic Claude Haiku 4.5**.
- Embeddings: **OpenAI `text-embedding-3-small`** (1536d).
- Deployment: **Vercel** for the Next.js app, **Supabase** for everything else.
- Package manager: **pnpm**.
- Node version: **20 LTS** (Vercel default).
- Code style: ESLint + Prettier, strict TS, no `any` without a `// FIXME` comment.

---

## 1. System diagram (what the dev needs to build)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  USER (browser)                                                            │
│    Google account → Supabase Auth → session cookie                         │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  NEXT.JS APP (Vercel)                                                      │
│                                                                             │
│  app/                                                                       │
│    (auth)/sign-in/page.tsx           — Google sign-in                       │
│    (app)/chat/page.tsx               — Mockup 1                             │
│    (app)/browse/page.tsx             — Mockup 2                             │
│    (app)/scenarios/[id]/page.tsx     — Mockup 3                             │
│    api/                                                                     │
│      chat/route.ts                   — POST, streaming                      │
│      search/route.ts                 — POST                                 │
│      reuse/route.ts                  — POST                                 │
│      scenarios/[id]/route.ts         — GET                                  │
│      ingest/manual/route.ts          — POST, admin only                     │
│      auth/callback/route.ts          — Google OAuth callback                │
│      health/route.ts                 — GET, no auth                         │
│                                                                             │
│  Server Components fetch directly from Supabase using the user's JWT.       │
│  RLS enforces "you only see your org's scenarios."                          │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                                   │
│                                                                             │
│  Postgres                                                                   │
│    Tables: make_scenarios, make_organizations, make_teams, make_folders,    │
│            make_users, ingestion_runs, ingestion_queue, scenario_patterns,  │
│            chat_messages, user_org_memberships                              │
│    Extensions: vector 0.8.0, pgcrypto, pg_cron                              │
│    Indexes: HNSW on embeddings, GIN on JSONB, BTREE on FKs, FTS on text     │
│                                                                             │
│  Auth                                                                       │
│    Google OAuth provider enabled                                            │
│    auth.users → app.user_org_memberships (org_id) → RLS policies            │
│                                                                             │
│  Storage                                                                    │
│    bucket: blueprints (private)                                             │
│    path: {make_scenario_id}/{blueprint_hash}.json                           │
│                                                                             │
│  Edge Functions (Deno)                                                      │
│    ingest-batch   — crawls Make API, enqueues work                          │
│    ingest-worker  — clean → analyze → embed → upsert (one scenario)         │
│    embed-backfill — re-embed rows missing embedding                         │
│    recompute-patterns — nightly clustering job                              │
│                                                                             │
│  pg_cron                                                                    │
│    0 3 * * * → ingest-batch (nightly 3am UTC)                               │
│    0 4 * * * → recompute-patterns (nightly 4am UTC)                         │
│    */15 * * * * → embed-backfill (every 15 min)                             │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL APIs                                                              │
│    Make.com API     — fetch teams/folders/scenarios/blueprints              │
│    Anthropic API    — Sonnet 4.5 analysis + reuse, Haiku 4.5 chat           │
│    OpenAI API       — text-embedding-3-small                                │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Repository layout

Use this exact structure. The dev should not invent a different one.

```
make-kb/
├── .github/
│   └── workflows/
│       ├── ci.yml                          # lint + typecheck + test on PR
│       └── deploy-functions.yml            # deploy Edge Functions on main push
├── .vscode/
│   └── settings.json
├── app/
│   ├── (auth)/
│   │   └── sign-in/
│   │       ├── page.tsx
│   │       └── google-button.tsx
│   ├── (app)/
│   │   ├── layout.tsx                      # protected layout, requires session
│   │   ├── chat/
│   │   │   ├── page.tsx
│   │   │   └── chat-client.tsx             # client component, useChat hook
│   │   ├── browse/
│   │   │   ├── page.tsx                    # server component, lists patterns
│   │   │   ├── filter-bar.tsx              # client component
│   │   │   └── pattern-card.tsx
│   │   └── scenarios/
│   │       └── [id]/
│   │           ├── page.tsx
│   │           ├── adapt-panel.tsx
│   │           └── data-flow.tsx
│   ├── api/
│   │   ├── chat/route.ts
│   │   ├── search/route.ts
│   │   ├── reuse/route.ts
│   │   ├── scenarios/
│   │   │   └── [id]/route.ts
│   │   ├── ingest/
│   │   │   └── manual/route.ts
│   │   ├── auth/
│   │   │   └── callback/route.ts
│   │   └── health/route.ts
│   ├── layout.tsx
│   ├── page.tsx                            # landing → redirect /chat if signed in
│   └── globals.css
├── components/
│   ├── ui/                                 # shadcn/ui primitives
│   ├── citation-pill.tsx
│   ├── scenario-card.tsx
│   └── empty-state.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts                       # createServerClient
│   │   ├── client.ts                       # createBrowserClient
│   │   ├── service.ts                      # createServiceClient (server-only!)
│   │   └── types.ts                        # generated DB types
│   ├── llm/
│   │   ├── anthropic.ts                    # provider wrapper
│   │   ├── openai-embeddings.ts
│   │   ├── prompts/
│   │   │   ├── analysis-system.ts
│   │   │   ├── analysis-schema.ts          # the JSON schema for structured output
│   │   │   ├── chat-system.ts
│   │   │   ├── query-understanding.ts
│   │   │   └── reuse-system.ts
│   │   └── routing.ts                      # which model for which task
│   ├── make/
│   │   ├── client.ts                       # Make.com API client
│   │   ├── types.ts                        # typed Make API responses
│   │   └── clean-blueprint.ts              # the surgical cleaner
│   ├── retrieval/
│   │   ├── hybrid-search.ts                # vector + FTS + filter
│   │   ├── query-rewrite.ts
│   │   └── rerank.ts                       # optional, stub for v1
│   ├── auth/
│   │   ├── get-session.ts
│   │   └── require-session.ts
│   └── utils/
│       ├── hash.ts                         # SHA-256 of canonical JSON
│       ├── logger.ts                       # structured logging
│       └── errors.ts                       # typed error classes
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260101000000_init.sql         # base schema (mostly exists)
│   │   ├── 20260101000001_hnsw_index.sql   # IVFFlat → HNSW
│   │   ├── 20260101000002_fts_column.sql   # tsvector + GIN
│   │   ├── 20260101000003_ingestion_tables.sql
│   │   ├── 20260101000004_chat_history.sql
│   │   ├── 20260101000005_patterns_table.sql
│   │   ├── 20260101000006_rls_enable.sql
│   │   ├── 20260101000007_rls_policies.sql
│   │   ├── 20260101000008_rpc_search.sql   # SQL function for hybrid search
│   │   └── 20260101000009_pg_cron.sql      # schedule edge functions
│   └── functions/
│       ├── _shared/
│       │   ├── anthropic.ts
│       │   ├── openai.ts
│       │   ├── make.ts
│       │   ├── clean-blueprint.ts          # same logic as lib/make/, Deno port
│       │   └── supabase.ts
│       ├── ingest-batch/
│       │   └── index.ts
│       ├── ingest-worker/
│       │   └── index.ts
│       ├── embed-backfill/
│       │   └── index.ts
│       └── recompute-patterns/
│           └── index.ts
├── evals/
│   ├── golden/
│   │   └── README.md                       # how to add golden blueprints
│   ├── run-analysis-evals.ts
│   └── run-retrieval-evals.ts
├── scripts/
│   ├── seed-dev.ts                         # populate dev DB with sample data
│   ├── generate-types.sh                   # supabase gen types typescript
│   └── deploy-functions.sh
├── tests/
│   ├── unit/
│   │   ├── clean-blueprint.test.ts
│   │   ├── hash.test.ts
│   │   └── hybrid-search.test.ts
│   └── integration/
│       └── ingest-pipeline.test.ts
├── .env.example
├── .env.local                              # gitignored
├── .eslintrc.json
├── .gitignore
├── .prettierrc
├── middleware.ts                           # auth middleware
├── next.config.mjs
├── package.json
├── pnpm-lock.yaml
├── README.md
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. Stack pins (exact versions)

`package.json` dependencies — pin to these or newer minors only:

```json
{
  "name": "make-kb",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "evals:analysis": "tsx evals/run-analysis-evals.ts",
    "evals:retrieval": "tsx evals/run-retrieval-evals.ts",
    "db:types": "bash scripts/generate-types.sh",
    "db:diff": "supabase db diff --schema public",
    "db:push": "supabase db push",
    "functions:deploy": "bash scripts/deploy-functions.sh"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.65.0",
    "ai": "^4.0.0",
    "zod": "^3.23.0",
    "tailwindcss": "^3.4.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "lucide-react": "^0.460.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.3.0",
    "vitest": "^2.0.0",
    "tsx": "^4.19.0",
    "supabase": "^1.200.0"
  }
}
```

**Why these:**
- `@supabase/ssr` is the modern way to use Supabase in Next.js App Router. Do **not** use `@supabase/auth-helpers-nextjs` (deprecated).
- `ai` (Vercel AI SDK) is used only for the chat streaming primitives (`useChat`, `streamText`). Anthropic client is called directly for analysis/reuse to keep tight control of structured output.
- `zod` for runtime validation of all LLM outputs and API request bodies.
- `lucide-react` for icons (the mockups used Tabler — swap to Lucide here for better Next.js DX; equivalent icons exist).

---

## 4. Environment variables

`.env.example`:

```bash
# ============================================
# Public (NEXT_PUBLIC_* are exposed to browser)
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://ybabwpbxckqggjxnueeh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ============================================
# Server-only (never NEXT_PUBLIC_)
# ============================================
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
MAKE_API_TOKEN=...
MAKE_API_BASE_URL=https://eu1.make.com/api/v2   # adjust per region
MAKE_DEFAULT_ORG_ID=12345

# ============================================
# Configuration
# ============================================
LLM_MODEL_ANALYSIS=claude-sonnet-4-5-20250929
LLM_MODEL_CHAT=claude-haiku-4-5-20251001
LLM_MODEL_REUSE=claude-sonnet-4-5-20250929
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
PROMPT_VERSION=v1.0

# Cost guardrails (USD)
DAILY_LLM_BUDGET_USD=20
DAILY_EMBEDDING_BUDGET_USD=2

# Ingestion
INGEST_CONCURRENCY=5
INGEST_RATE_LIMIT_PER_MIN=30
```

Edge Function secrets (set via `supabase secrets set`):
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `MAKE_API_TOKEN`
- `MAKE_API_BASE_URL`
- `PROMPT_VERSION`
- `LLM_MODEL_ANALYSIS`
- `EMBEDDING_MODEL`

Vercel env vars (Production + Preview + Development):
- All `NEXT_PUBLIC_*`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `MAKE_API_TOKEN`
- `MAKE_API_BASE_URL`
- `MAKE_DEFAULT_ORG_ID`

---

## 5. Database — current state and migrations

### 5.1 What already exists in project `ybabwpbxckqggjxnueeh`

(Verified directly. Don't recreate, only migrate from this baseline.)

**Tables (5):** `make_organizations`, `make_teams`, `make_folders`, `make_users`, `make_scenarios` — all currently with `rowsecurity = false`.

**`make_scenarios` has 43 columns** matching the spec in `AI-Architecture.md` §3.2:
- Identity & denormalized relations
- LLM-generated understanding (one_line_summary, business_purpose, full_description, data_flow, branches_summary, error_handling, reuse_notes)
- Structured tags (apps_involved, tags, use_cases as **JSONB**, category, trigger_type/app/event, complexity)
- Blueprint storage (blueprint_json, blueprint_clean_json, blueprint_storage_url, blueprint_hash)
- LLM audit (llm_analysis_json, llm_model_used, llm_prompt_version, analyzed_at)
- `embedding vector(1536)`
- Timestamps (make_created_at, make_updated_at, imported_at, reanalyzed_at)

**Extensions installed:** `vector 0.8.0`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`.

**Existing indexes on `make_scenarios`:**
- `make_scenarios_pkey` (id)
- `make_scenarios_make_scenario_id_key` (unique on make_scenario_id)
- BTREE on team_id, folder_id, trigger_app, complexity
- GIN on apps_involved, tags
- **`ivfflat` on embedding** ← migrate to HNSW

**Row count:** 0 (clean slate).

### 5.2 Migrations to apply (in order)

Each migration is a separate file in `supabase/migrations/`. Use `apply_migration` from Supabase, never raw SQL editor.

#### Migration 1 — `hnsw_index` (replace IVFFlat with HNSW)

```sql
-- Drop the IVFFlat index, create HNSW. CONCURRENTLY is required so we don't
-- lock the table — but CONCURRENTLY can't be inside a transaction, so
-- this migration runs outside one.

DROP INDEX IF EXISTS make_scenarios_embedding_idx;

CREATE INDEX make_scenarios_embedding_idx
  ON public.make_scenarios
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

#### Migration 2 — `fts_column` (full-text search for hybrid retrieval)

```sql
ALTER TABLE public.make_scenarios
  ADD COLUMN search_text tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(scenario_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(one_line_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(business_purpose, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(full_description, '')), 'C')
  ) STORED;

CREATE INDEX make_scenarios_fts_idx
  ON public.make_scenarios USING gin (search_text);

CREATE INDEX make_scenarios_use_cases_idx
  ON public.make_scenarios USING gin (use_cases);
```

#### Migration 3 — `ingestion_tables`

```sql
CREATE TABLE public.ingestion_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id         text NOT NULL,
  trigger             text NOT NULL CHECK (trigger IN ('manual','batch','webhook','recurring')),
  status              text NOT NULL CHECK (status IN (
    'success','skipped_hash_match','failed_fetch','failed_clean',
    'failed_llm','failed_embed','failed_insert'
  )),
  blueprint_hash      text,
  llm_model_used      text,
  llm_prompt_version  text,
  llm_tokens_in       int,
  llm_tokens_out      int,
  llm_cost_usd        numeric(10,4),
  embedding_tokens    int,
  embedding_cost_usd  numeric(10,4),
  duration_ms         int,
  error_message       text,
  error_stack         text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz
);

CREATE INDEX ON public.ingestion_runs (scenario_id, started_at DESC);
CREATE INDEX ON public.ingestion_runs (status, started_at DESC);

CREATE TABLE public.ingestion_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id     text NOT NULL,
  org_id          uuid REFERENCES public.make_organizations(id),
  team_id         uuid REFERENCES public.make_teams(id),
  folder_id       uuid REFERENCES public.make_folders(id),
  priority        int NOT NULL DEFAULT 5,
  attempts        int NOT NULL DEFAULT 0,
  locked_at       timestamptz,
  locked_by       text,
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_pending_scenario UNIQUE (scenario_id)
);

CREATE INDEX ON public.ingestion_queue (priority, enqueued_at) WHERE locked_at IS NULL;
```

#### Migration 4 — `chat_history`

```sql
CREATE TABLE public.chat_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES public.make_organizations(id),
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.chat_conversations (user_id, updated_at DESC);

CREATE TABLE public.chat_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('user','assistant')),
  content           text NOT NULL,
  cited_scenario_ids uuid[],
  llm_model_used    text,
  llm_tokens_in     int,
  llm_tokens_out    int,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.chat_messages (conversation_id, created_at);
```

#### Migration 5 — `patterns_table`

```sql
CREATE TABLE public.scenario_patterns (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid REFERENCES public.make_organizations(id),
  pattern_name                text NOT NULL,
  pattern_summary             text NOT NULL,
  category                    text,
  apps_in_pattern             jsonb,
  member_scenario_ids         uuid[],
  representative_scenario_id  uuid REFERENCES public.make_scenarios(id),
  embedding                   vector(1536),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.scenario_patterns USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON public.scenario_patterns (org_id);
CREATE INDEX ON public.scenario_patterns (category);
```

#### Migration 6 — `user_org_memberships` (for RLS)

```sql
CREATE TABLE public.user_org_memberships (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.make_organizations(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

CREATE INDEX ON public.user_org_memberships (user_id);
CREATE INDEX ON public.user_org_memberships (org_id);
```

#### Migration 7 — `rls_enable`

```sql
ALTER TABLE public.make_organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_folders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.make_scenarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_patterns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_org_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_queue       ENABLE ROW LEVEL SECURITY;
```

#### Migration 8 — `rls_policies`

```sql
-- Helper function: returns user's org IDs. SECURITY DEFINER so the policy can
-- read user_org_memberships without recursion.
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM public.user_org_memberships WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;

-- ──────────── make_scenarios ────────────
CREATE POLICY "members read own org scenarios"
  ON public.make_scenarios FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "service_role full access scenarios"
  ON public.make_scenarios FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ──────────── make_organizations / teams / folders / users ────────────
CREATE POLICY "members read own orgs"
  ON public.make_organizations FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_org_ids()));

CREATE POLICY "members read own teams"
  ON public.make_teams FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "members read own folders"
  ON public.make_folders FOR SELECT TO authenticated
  USING (team_id IN (
    SELECT id FROM public.make_teams WHERE org_id IN (SELECT public.user_org_ids())
  ));

CREATE POLICY "members read own users"
  ON public.make_users FOR SELECT TO authenticated
  USING (true);  -- user records aren't org-scoped; safe to read

-- service_role full access for all of the above (Edge Functions write here)
CREATE POLICY "service_role orgs" ON public.make_organizations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role teams" ON public.make_teams FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role folders" ON public.make_folders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role mkusers" ON public.make_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ──────────── scenario_patterns ────────────
CREATE POLICY "members read own patterns"
  ON public.scenario_patterns FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));
CREATE POLICY "service_role patterns" ON public.scenario_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ──────────── chat (per-user, not per-org) ────────────
CREATE POLICY "users own conversations"
  ON public.chat_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users own messages"
  ON public.chat_messages FOR ALL TO authenticated
  USING (conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = auth.uid()
  ))
  WITH CHECK (conversation_id IN (
    SELECT id FROM public.chat_conversations WHERE user_id = auth.uid()
  ));

-- ──────────── user_org_memberships ────────────
CREATE POLICY "users see own memberships"
  ON public.user_org_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "service_role memberships"
  ON public.user_org_memberships FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ──────────── ingestion_runs / ingestion_queue (admin/service only) ────────────
-- No authenticated policy → authenticated role cannot read these.
CREATE POLICY "service_role runs" ON public.ingestion_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role queue" ON public.ingestion_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
```

#### Migration 9 — `rpc_search` (the hybrid search function)

```sql
-- Called from /api/search and /api/chat. Returns ranked scenarios.
-- Pre-filters with SQL, then scores with vector + FTS, weighted sum.
CREATE OR REPLACE FUNCTION public.search_scenarios(
  p_query_embedding   vector(1536),
  p_query_text        text,
  p_apps              jsonb DEFAULT NULL,           -- ["hubspotcrm", ...] or NULL
  p_categories        text[] DEFAULT NULL,
  p_trigger_types     text[] DEFAULT NULL,
  p_team_ids          uuid[] DEFAULT NULL,
  p_complexity        text[] DEFAULT NULL,
  p_match_count       int DEFAULT 10,
  p_vector_weight     numeric DEFAULT 0.7
)
RETURNS TABLE (
  id                  uuid,
  make_scenario_id    text,
  scenario_name       text,
  one_line_summary    text,
  category            text,
  trigger_type        text,
  trigger_app         text,
  apps_involved       jsonb,
  tags                jsonb,
  team_name           text,
  complexity          text,
  score               numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER             -- RLS applies → user only sees their org's rows
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      s.id, s.make_scenario_id, s.scenario_name, s.one_line_summary,
      s.category, s.trigger_type, s.trigger_app, s.apps_involved,
      s.tags, s.team_name, s.complexity, s.embedding, s.search_text
    FROM public.make_scenarios s
    WHERE (p_apps           IS NULL OR s.apps_involved ?| (SELECT array_agg(jsonb_array_elements_text(p_apps))))
      AND (p_categories     IS NULL OR s.category = ANY(p_categories))
      AND (p_trigger_types  IS NULL OR s.trigger_type = ANY(p_trigger_types))
      AND (p_team_ids       IS NULL OR s.team_id = ANY(p_team_ids))
      AND (p_complexity     IS NULL OR s.complexity = ANY(p_complexity))
      AND s.embedding IS NOT NULL
  ),
  scored AS (
    SELECT
      c.*,
      (1 - (c.embedding <=> p_query_embedding))                                AS vec_score,
      COALESCE(ts_rank_cd(c.search_text, websearch_to_tsquery('english', p_query_text)), 0) AS fts_score
    FROM candidates c
  )
  SELECT
    id, make_scenario_id, scenario_name, one_line_summary,
    category, trigger_type, trigger_app, apps_involved, tags,
    team_name, complexity,
    (p_vector_weight * vec_score + (1 - p_vector_weight) * LEAST(fts_score, 1.0))::numeric AS score
  FROM scored
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION public.search_scenarios TO authenticated;
```

#### Migration 10 — `pg_cron`

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Nightly batch ingestion at 03:00 UTC
SELECT cron.schedule(
  'ingest-batch-nightly',
  '0 3 * * *',
  $$ SELECT net.http_post(
       url := 'https://ybabwpbxckqggjxnueeh.supabase.co/functions/v1/ingest-batch',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.edge_function_secret')
       ),
       body := jsonb_build_object('trigger', 'recurring')
     ); $$
);

-- Pattern recomputation at 04:00 UTC
SELECT cron.schedule(
  'recompute-patterns-nightly',
  '0 4 * * *',
  $$ SELECT net.http_post(
       url := 'https://ybabwpbxckqggjxnueeh.supabase.co/functions/v1/recompute-patterns',
       headers := jsonb_build_object('Content-Type', 'application/json',
                                     'Authorization', 'Bearer ' || current_setting('app.edge_function_secret'))
     ); $$
);

-- Embedding backfill every 15 min
SELECT cron.schedule(
  'embed-backfill',
  '*/15 * * * *',
  $$ SELECT net.http_post(
       url := 'https://ybabwpbxckqggjxnueeh.supabase.co/functions/v1/embed-backfill',
       headers := jsonb_build_object('Content-Type', 'application/json',
                                     'Authorization', 'Bearer ' || current_setting('app.edge_function_secret'))
     ); $$
);
```

**Note:** `app.edge_function_secret` must be set via `ALTER DATABASE postgres SET app.edge_function_secret = '...';` to a value that the Edge Functions verify. The Edge Functions must check this header before doing any work — otherwise anyone can trigger them.

---

## 6. Authentication — Google OAuth via Supabase

### 6.1 Supabase dashboard config (manual, one-time)

1. **Auth → Providers → Google → Enable.**
2. In Google Cloud Console: create OAuth 2.0 Client ID (Web application).
   - Authorized redirect URIs:
     - `https://ybabwpbxckqggjxnueeh.supabase.co/auth/v1/callback`
3. Copy Client ID and Client Secret into Supabase Google provider config.
4. Auth → URL Configuration:
   - **Site URL:** production URL (e.g. `https://kb.acme.com`)
   - **Redirect URLs:** add `http://localhost:3000/api/auth/callback`, `https://*.vercel.app/api/auth/callback`, `https://kb.acme.com/api/auth/callback`

### 6.2 Code — Supabase clients

`lib/supabase/server.ts`:

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch { /* server-component context — handled by middleware */ }
        },
      },
    },
  )
}
```

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

`lib/supabase/service.ts` (server-only, never imported by client code):

```ts
import 'server-only'
import { createClient as createSupaClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createSupaClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

### 6.3 Middleware (refresh session on every request)

`middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect (app)/* routes
  if (!user && req.nextUrl.pathname.startsWith('/chat') ||
      !user && req.nextUrl.pathname.startsWith('/browse') ||
      !user && req.nextUrl.pathname.startsWith('/scenarios')) {
    const url = req.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}
```

### 6.4 Sign-in flow

`app/(auth)/sign-in/google-button.tsx`:

```tsx
'use client'
import { createClient } from '@/lib/supabase/client'

export function GoogleButton() {
  const supabase = createClient()
  const onClick = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }
  return <button onClick={onClick}>Sign in with Google</button>
}
```

`app/api/auth/callback/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/chat`)
}
```

### 6.5 Org assignment (the missing link)

A signed-in user has no `org_id` until they're added to `user_org_memberships`. For v1, **bootstrap manually** via a Supabase SQL script. v1.5 can add invite flow.

Bootstrap script (one-time, run from the Supabase SQL editor as service_role):

```sql
-- After a user signs in for the first time, add them to the default org
INSERT INTO public.user_org_memberships (user_id, org_id, role)
SELECT u.id, o.id, 'admin'
FROM auth.users u, public.make_organizations o
WHERE u.email = 'rimas@acme.com' AND o.make_org_id = '12345'
ON CONFLICT (user_id, org_id) DO NOTHING;
```

For the developer: add a `scripts/grant-user-org-access.ts` helper that takes `--email` and `--org_id`.

---

## 7. The LLM analysis prompt (locked, v1.0)

**This is the single most important asset in the codebase.** It lives in code, version-controlled, and must not be changed without bumping `PROMPT_VERSION` and re-running evals.

`lib/llm/prompts/analysis-system.ts`:

```ts
export const ANALYSIS_SYSTEM_PROMPT = `You are an expert Make.com automation architect.
Your job is to read a cleaned Make.com scenario blueprint JSON and produce a
structured analysis describing the scenario as a business process.

RULES:
- Read the FULL blueprint including all modules, mappers, filters, routes, and onerror paths.
- Understand the complete business logic end-to-end.
- Describe WHAT it does in business terms, not technical module names.
- Always return ONLY valid JSON matching the schema. No prose before or after. No markdown fences.
- Never invent functionality that isn't in the blueprint.
- If a router or filter exists, describe EVERY branch.
- For apps_involved, extract from the module key before the colon (e.g. "hubspotcrm" from
  "hubspotcrm:getContact"). EXCLUDE "builtin" — that is an internal Make module, not a real app.
- For trigger_app, use the app key of the FIRST module in flow only.`
```

`lib/llm/prompts/analysis-schema.ts`:

```ts
export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    one_line_summary: { type: 'string' },
    business_purpose: { type: 'string' },
    full_description: { type: 'string' },
    data_flow:        { type: 'string' },
    branches: {
      type: 'array',
      description: 'Every router or filter condition. Empty array [] if none.',
      items: {
        type: 'object',
        properties: {
          condition:  { type: 'string' },
          path_true:  { type: 'string' },
          path_false: { type: 'string' },
        },
        required: ['condition', 'path_true', 'path_false'],
      },
    },
    error_handling: {
      type: 'string',
      description: "Every onerror handler: which module, type (Resume/Rollback/Ignore/Commit/Break), and impact. 'No error handlers configured' if none.",
    },
    apps_involved: {
      type: 'array',
      description: "App keys only, extracted before the colon. Exclude 'builtin'. No duplicates.",
      items: { type: 'string' },
    },
    use_cases: { type: 'array', items: { type: 'string' }, description: '2-4 short business use case labels.' },
    tags:      { type: 'array', items: { type: 'string' }, description: '5-8 lowercase search tags. Include app names, object types, actions.' },
    category:  { type: 'string', description: 'Pick one: Ad Tracking / CRM Sync / Lead Management / Notifications / E-commerce / Data Enrichment / Ops / Reporting / Internal Tools / Customer Success.' },
    trigger_type: {
      type: 'string',
      enum: ['polling', 'webhook', 'instant', 'scheduled'],
      description: 'polling = scheduled poll for new/updated records. webhook = external push. instant = Make-native instant trigger. scheduled = pure time-based, no data source.',
    },
    trigger_app:   { type: 'string', description: 'App key of the FIRST module only.' },
    trigger_event: { type: 'string', description: "Human-readable event name, e.g. 'Deal Updated'." },
    complexity: {
      type: 'string',
      enum: ['simple', 'medium', 'complex'],
      description: 'simple = linear, 1-3 modules. medium = 4-8 modules or some branching. complex = 9+ modules or multiple routers/error paths.',
    },
    reuse_notes: {
      type: 'string',
      description: 'Concrete and specific: which connections need replacing, which IDs are hardcoded, which mappings are account-specific. No generic advice.',
    },
  },
  required: [
    'one_line_summary','business_purpose','full_description','data_flow',
    'branches','error_handling','apps_involved','use_cases','tags',
    'category','trigger_type','trigger_app','trigger_event','complexity','reuse_notes',
  ],
} as const
```

Use **Anthropic tool use** for structured output (not raw JSON parsing):

```ts
const response = await anthropic.messages.create({
  model: process.env.LLM_MODEL_ANALYSIS!,
  max_tokens: 2000,
  temperature: 0,
  system: ANALYSIS_SYSTEM_PROMPT,
  tools: [{
    name: 'submit_analysis',
    description: 'Submit the structured scenario analysis',
    input_schema: ANALYSIS_SCHEMA,
  }],
  tool_choice: { type: 'tool', name: 'submit_analysis' },
  messages: [{
    role: 'user',
    content: `Analyze this Make.com scenario blueprint and submit via the tool.

Scenario name: ${scenarioName}

BLUEPRINT:
${JSON.stringify(cleanedBlueprint)}`,
  }],
})
// Extract: response.content[0].input (the tool input is the validated JSON)
```

---

## 8. The surgical cleaner

`lib/make/clean-blueprint.ts` — port of the JS module from the prior work. One file, no dependencies.

```ts
import type { MakeBlueprint, MakeModule } from './types'

export function cleanModule(mod: MakeModule): Partial<MakeModule> {
  const cleaned: any = {
    id: mod.id,
    module: mod.module,
    version: mod.version,
    parameters: mod.parameters,
    mapper: mod.mapper,
  }
  if (mod.filter) cleaned.filter = mod.filter
  if (mod.metadata?.restore && Object.keys(mod.metadata.restore).length > 0) {
    cleaned.metadata = { restore: mod.metadata.restore }
  }
  if (Array.isArray(mod.onerror)) cleaned.onerror = mod.onerror.map(cleanModule)
  if (Array.isArray((mod as any).routes)) {
    cleaned.routes = (mod as any).routes.map((r: any) => ({
      ...r,
      flow: Array.isArray(r.flow) ? r.flow.map(cleanModule) : [],
    }))
  }
  return cleaned
}

export function cleanBlueprint(bp: MakeBlueprint): MakeBlueprint {
  return {
    name: bp.name,
    flow: Array.isArray(bp.flow) ? bp.flow.map(cleanModule) as MakeModule[] : [],
    metadata: {
      instant:  bp.metadata?.instant,
      version:  bp.metadata?.version,
      scenario: bp.metadata?.scenario,
    },
  }
}

export function extractApps(bp: MakeBlueprint): string[] {
  const apps = new Set<string>()
  function walk(modules: MakeModule[]) {
    for (const m of modules) {
      const app = m.module?.split(':')[0]
      if (app && app !== 'builtin') apps.add(app)
      if (Array.isArray(m.onerror)) walk(m.onerror)
      if (Array.isArray((m as any).routes)) {
        for (const r of (m as any).routes) {
          if (Array.isArray(r.flow)) walk(r.flow)
        }
      }
    }
  }
  walk(bp.flow ?? [])
  return Array.from(apps)
}
```

The Edge Function uses an identical copy under `supabase/functions/_shared/clean-blueprint.ts` (Deno-compatible, no imports from `lib/`).

---

## 9. API contracts

All API routes are in `app/api/`. All take JSON, return JSON (or stream). All require auth except `/api/health`.

### 9.1 `POST /api/search`

**Request:**
```ts
{
  query: string;                  // free-text query
  filters?: {
    apps?: string[];              // ["hubspotcrm"]
    categories?: string[];
    trigger_types?: ('polling'|'webhook'|'instant'|'scheduled')[];
    team_ids?: string[];          // UUIDs
    complexity?: ('simple'|'medium'|'complex')[];
  };
  limit?: number;                 // default 10, max 50
}
```

**Response (200):**
```ts
{
  query: string;
  results: Array<{
    id: string;
    make_scenario_id: string;
    scenario_name: string;
    one_line_summary: string;
    category: string;
    trigger_type: string;
    trigger_app: string;
    apps_involved: string[];
    tags: string[];
    team_name: string | null;
    complexity: 'simple'|'medium'|'complex';
    score: number;                // 0..1
    open_in_make_url: string;
  }>;
  took_ms: number;
}
```

**Errors:** 400 invalid body, 401 not signed in, 500 internal.

### 9.2 `POST /api/chat` (streaming)

**Request:**
```ts
{
  message: string;
  conversation_id?: string;   // omit to start a new conversation
}
```

**Response:** SSE stream (Vercel AI SDK `streamText` format), terminating with a JSON metadata frame:

```
data: {"type":"text-delta","textDelta":"Yes — there's one direct match..."}
data: {"type":"text-delta","textDelta":" The closest fit is [1]..."}
...
data: {"type":"finish","metadata":{
  "conversation_id":"uuid",
  "message_id":"uuid",
  "cited_scenario_ids":["uuid1","uuid2","uuid3"],
  "retrieved_scenarios":[ {/* same shape as /search results */} ]
}}
```

The client renders citations by matching `[N]` in the streamed text to indexes in `retrieved_scenarios`.

### 9.3 `POST /api/reuse`

**Request:**
```ts
{
  source_scenario_id: string;
  modification_request: string;   // "swap HubSpot for Pipedrive"
}
```

**Response:**
```ts
{
  new_blueprint: object;          // a valid Make.com blueprint JSON
  change_summary: string[];       // ["Replaced HubSpot trigger with Pipedrive trigger", ...]
  warnings: string[];             // ["Pipedrive doesn't have an exact equivalent for X", ...]
  llm_model_used: string;
  estimated_cost_usd: number;
}
```

### 9.4 `GET /api/scenarios/[id]`

Returns the full record for the detail page. Standard 200/401/403/404.

### 9.5 `POST /api/ingest/manual` (admin only)

Triggers a single-scenario ingestion. Requires `user_org_memberships.role IN ('owner','admin')`.

```ts
// Request
{ make_scenario_id: string; force?: boolean; }   // force ignores hash check
// Response
{ status: 'queued'|'skipped_hash_match'; ingestion_run_id: string; }
```

### 9.6 `GET /api/health`

No auth. Returns `{ status: 'ok', version: '0.1.0', commit: '<sha>' }`.

---

## 10. Edge Functions

Three functions live in `supabase/functions/`. Each is a standalone Deno script.

### 10.1 `ingest-batch`

**Trigger:** pg_cron (nightly) or manual POST with admin token.

**Flow:**
1. Verify the `Authorization: Bearer <app.edge_function_secret>` header.
2. For each known Make org (or just `MAKE_DEFAULT_ORG_ID` in v1):
   - List teams → for each team, list folders → for each folder, list scenarios.
   - For each scenario:
     - Fetch the blueprint (full export).
     - Compute SHA-256 over the canonical JSON.
     - Look up existing row by `make_scenario_id`.
     - If hash matches AND `llm_prompt_version` matches current → skip, log `skipped_hash_match`.
     - Else: enqueue in `ingestion_queue` with priority 5.
3. Trigger the `ingest-worker` function for each queued item (concurrency ≤5).
4. Log a summary row to `ingestion_runs` with `trigger='recurring'` per scenario.

### 10.2 `ingest-worker`

**Trigger:** Invoked by `ingest-batch` per queued item, or by `/api/ingest/manual`.

**Flow (one scenario per invocation):**
1. Verify auth header.
2. Pop one row from `ingestion_queue` using a `SELECT ... FOR UPDATE SKIP LOCKED` pattern.
3. Fetch the blueprint from Make (if not already passed in body).
4. Run the cleaner.
5. Call Anthropic with the analysis prompt + schema. Validate result with Zod against the schema.
   - On invalid response: retry once with temperature 0.1. If still bad, log `failed_llm`, leave queue item unlocked for next run (max attempts=3), return 500.
6. Build `embedding_input` string, call OpenAI embeddings.
7. Upsert into `make_scenarios` with `ON CONFLICT (make_scenario_id) DO UPDATE`.
8. Upsert into reference tables (`make_organizations`, `make_teams`, `make_folders`, `make_users`) if new IDs seen.
9. If blueprint raw size > 500KB, write to Supabase Storage at `blueprints/{make_scenario_id}/{hash}.json` and set `blueprint_storage_url`, null the `blueprint_json` column.
10. Delete the queue row, write `ingestion_runs` row with cost data.

### 10.3 `embed-backfill`

**Trigger:** pg_cron every 15 min.

**Flow:** Find up to 20 rows with `embedding IS NULL` but `full_description IS NOT NULL`. For each, build the embedding input string, call OpenAI, update the row. This handles cases where the LLM analysis succeeded but the embedding step failed.

### 10.4 `recompute-patterns`

**Trigger:** pg_cron nightly at 04:00 UTC.

**Flow:**
1. For each org, fetch all scenario embeddings.
2. Run agglomerative clustering with cosine distance threshold 0.15 (= similarity > 0.85). Use a simple in-Deno implementation; no external library needed at this scale.
3. For each cluster of ≥2 scenarios:
   - Call Sonnet 4.5 with the cluster's descriptions, ask for `{ pattern_name, pattern_summary, apps_in_pattern }`.
   - Pick the representative as the scenario with median embedding to cluster centroid.
   - Upsert into `scenario_patterns`. Embed the `pattern_summary` too.
4. Delete patterns whose members all disappeared.

---

## 11. Hybrid retrieval — implementation

`lib/retrieval/hybrid-search.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { embed } from '@/lib/llm/openai-embeddings'

export interface SearchFilters {
  apps?: string[]
  categories?: string[]
  trigger_types?: string[]
  team_ids?: string[]
  complexity?: string[]
}

export async function hybridSearch(query: string, filters: SearchFilters = {}, limit = 10) {
  const supabase = await createClient()
  const embedding = await embed(query)

  const { data, error } = await supabase.rpc('search_scenarios', {
    p_query_embedding: embedding,
    p_query_text: query,
    p_apps: filters.apps ? JSON.stringify(filters.apps) : null,
    p_categories: filters.categories ?? null,
    p_trigger_types: filters.trigger_types ?? null,
    p_team_ids: filters.team_ids ?? null,
    p_complexity: filters.complexity ?? null,
    p_match_count: limit,
    p_vector_weight: 0.7,
  })

  if (error) throw new Error(`search_scenarios failed: ${error.message}`)
  return data
}
```

The RPC enforces RLS automatically (`SECURITY INVOKER`).

---

## 12. Chat route

`app/api/chat/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { hybridSearch } from '@/lib/retrieval/hybrid-search'
import { extractFilters } from '@/lib/retrieval/query-rewrite'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const Body = z.object({
  message: z.string().min(1).max(2000),
  conversation_id: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = Body.parse(await req.json())

  // 1. Find or create conversation
  let conversationId = body.conversation_id
  if (!conversationId) {
    const { data } = await supabase
      .from('chat_conversations')
      .insert({ user_id: user.id })
      .select('id').single()
    conversationId = data!.id
  }

  // 2. Save user message
  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: body.message,
  })

  // 3. Query understanding → filters
  const filters = await extractFilters(body.message)

  // 4. Hybrid retrieval
  const results = await hybridSearch(body.message, filters, 5)

  // 5. Build context block
  const context = results.map((r, i) => (
    `[${i+1}] ${r.scenario_name}
Summary: ${r.one_line_summary}
Apps: ${(r.apps_involved as string[]).join(', ')}
Category: ${r.category}
ID: ${r.make_scenario_id}`
  )).join('\n\n')

  // 6. Load conversation history (last 6 turns)
  const { data: history } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(12)

  const historyMessages = (history ?? []).reverse().map(m => ({
    role: m.role as 'user'|'assistant',
    content: m.content,
  }))

  // 7. Stream from Anthropic
  const anthropic = new Anthropic()
  const stream = await anthropic.messages.stream({
    model: process.env.LLM_MODEL_CHAT!,
    max_tokens: 1024,
    system: `You are the Make Scenarios KB assistant. Answer questions about
the user's Make.com scenarios, grounded ONLY in the scenarios provided in
<scenarios>. Cite scenarios with [N] notation matching the numbers in the list.
If nothing matches, say so explicitly. Never invent scenarios or capabilities.

<scenarios>
${context}
</scenarios>`,
    messages: historyMessages,
  })

  // 8. Stream back, then save assistant message at the end
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      let fullText = ''
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', textDelta: event.delta.text })}\n\n`))
        }
      }
      // Save assistant message
      await supabase.from('chat_messages').insert({
        conversation_id: conversationId!,
        role: 'assistant',
        content: fullText,
        cited_scenario_ids: results.map(r => r.id),
        llm_model_used: process.env.LLM_MODEL_CHAT,
      })
      // Final metadata frame
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'finish',
        metadata: {
          conversation_id: conversationId,
          cited_scenario_ids: results.map(r => r.id),
          retrieved_scenarios: results,
        }
      })}\n\n`))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
```

---

## 13. UI implementation notes

- **Use shadcn/ui** primitives: `Button`, `Card`, `Input`, `Textarea`, `Dialog`, `DropdownMenu`, `Tabs`. Initialize via `pnpm dlx shadcn@latest init`.
- **Tailwind config:** match the design system from `UI-Recommendations.md` — flat surfaces, 0.5px borders, two font weights only.
- **Icons:** `lucide-react`. Map from the Tabler names in mockups:
  - `ti-sparkles` → `Sparkles`
  - `ti-external-link` → `ExternalLink`
  - `ti-copy` → `Copy`
  - `ti-stack-2` → `Layers2`
  - `ti-git-branch` → `GitBranch`
  - `ti-alert-triangle` → `AlertTriangle`
- **Chat UI:** use `useChat` from `ai/react` for the streaming part. Custom rendering for citation pills.
- **Server Components by default**, client components only where needed (chat input, filter dropdowns, adapt panel).
- **Loading states:** Suspense + skeleton cards. No spinners on the main thread.
- **Empty states:** every list view must have a designed empty state with helpful text ("No scenarios match these filters" + clear-filters button).
- **Dark mode:** Tailwind `dark:` classes, follow system preference.

---

## 14. Evals

### 14.1 Golden set structure

`evals/golden/{scenario_id}.json`:
```json
{
  "scenario_id": "v5-hubspot-fb-capi",
  "blueprint_path": "evals/golden/blueprints/v5-hubspot-fb-capi.json",
  "expected_analysis": {
    "one_line_summary": "When HubSpot deal updates → send conversion event to Facebook CAPI",
    "trigger_type": "polling",
    "trigger_app": "hubspotcrm",
    "trigger_event": "Deal Updated",
    "complexity": "medium",
    "category": "Ad Tracking",
    "apps_involved": ["hubspotcrm", "facebook-conversion-leads"],
    "tags_must_include": ["hubspot", "facebook-capi", "deals"],
    "tags_must_not_include": ["builtin"],
    "branch_count": 1
  }
}
```

### 14.2 `evals/run-analysis-evals.ts`

For each golden file:
1. Clean the blueprint.
2. Run the production analysis pipeline.
3. Compare:
   - Exact match: `trigger_type`, `trigger_app`, `complexity`, `category`, `branch_count`
   - Subset check: `apps_involved` ⊇ expected; `apps_involved` ∩ forbidden = ∅
   - Jaccard on tags ≥ 0.5
   - Semantic similarity of `full_description` to a reference description ≥ 0.85
4. Output per-test PASS/FAIL + overall score. Exit non-zero on any failure.

### 14.3 Retrieval evals

`evals/golden-queries.json` — 30 queries with expected top-3 scenario IDs.

`evals/run-retrieval-evals.ts` — measures recall@5 and MRR. Target recall@5 ≥ 0.9.

### 14.4 CI integration

Add to `.github/workflows/ci.yml`:
```yaml
- name: Run analysis evals
  run: pnpm evals:analysis
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Run on every PR that touches `lib/llm/prompts/**` or bumps `PROMPT_VERSION`.

---

## 15. Cost guardrails

Implement in `lib/llm/anthropic.ts` and `lib/llm/openai-embeddings.ts`:

1. **Per-request cost calculation.** Multiply tokens by model rates from a constant table.
2. **Daily budget check.** Before every LLM call, query `ingestion_runs` for today's total LLM cost. If > `DAILY_LLM_BUDGET_USD`, throw a `BudgetExceededError` and skip the call.
3. **Per-call logging.** Every successful call records its cost.

Model pricing (per 1M tokens, as of writing):
- `claude-sonnet-4-5`: $3 in / $15 out
- `claude-haiku-4-5`: $1 in / $5 out
- `text-embedding-3-small`: $0.02

---

## 16. Security checklist (must verify before shipping)

- [ ] RLS enabled on every public table (`SELECT … FROM pg_tables WHERE schemaname='public' AND rowsecurity=true`)
- [ ] `service_role` key only used in server-side code, never imported by client components
- [ ] `lib/supabase/service.ts` starts with `import 'server-only'`
- [ ] Middleware runs `supabase.auth.getUser()` (not `getSession()`, which doesn't verify)
- [ ] All `/api/*` routes call `await supabase.auth.getUser()` first
- [ ] Edge Function authorization header verified before any work
- [ ] No API keys in client bundle (grep for `sk-` and `sk-ant-` in `.next/static/`)
- [ ] CORS not opened (Next.js default is same-origin only)
- [ ] Rate limiting on `/api/chat` and `/api/reuse` (Vercel KV + simple sliding window, 30 req/min/user)
- [ ] Zod validates every API request body
- [ ] Storage bucket `blueprints` is private; signed URLs only

---

## 17. Observability

- **Logging:** structured JSON to stdout. Vercel captures it.
- **Error tracking:** Sentry SDK (free tier). Wrap API routes with `withSentry`.
- **DB metrics:** Supabase dashboard built-ins.
- **Custom dashboards:** SQL views over `ingestion_runs` and `chat_messages`:
  - `vw_ingestion_health` (last 24h success rate, p95 duration, cost)
  - `vw_chat_usage` (msgs/day, avg results, queries with 0 results)
  - `vw_daily_spend` (LLM + embedding by day)
- **Alerts:** Supabase has email alerts on DB metrics. For app-level, set up a daily cron that posts a Slack message with key numbers.

---

## 18. Acceptance criteria (the "done" definition)

A milestone is complete when **all** of the following are true:

### M1 — Ingestion working end-to-end (Week 1-2)

- [ ] All 10 migrations applied successfully
- [ ] RLS enabled, policies in place, verified with a test user
- [ ] Edge Function `ingest-worker` deployed; can be invoked manually with a `make_scenario_id` and produces a complete row including embedding
- [ ] `ingest-batch` deployed; nightly cron is scheduled
- [ ] At least 20 real scenarios ingested with no failures
- [ ] Eval set of 20 scenarios passes with ≥ 90% match rate
- [ ] Daily LLM cost visible in `vw_daily_spend`

### M2 — Auth + browse working (Week 3)

- [ ] Google OAuth works in production
- [ ] Signed-in user with org membership sees their scenarios on `/browse`
- [ ] Signed-in user without org membership sees an empty state with admin contact info
- [ ] Signed-in user CANNOT see another org's scenarios (verified by direct REST call with their JWT)
- [ ] Filter chips work and combine correctly
- [ ] Patterns view shows clusters; All view shows individuals
- [ ] Detail page renders full understanding + reuse notes

### M3 — Chat + reuse working (Week 4)

- [ ] `/chat` streams responses with citation pills
- [ ] Citations are clickable and scroll to / link to scenarios
- [ ] Suggested follow-ups are generated and tappable
- [ ] `/reuse` produces a valid blueprint JSON that imports cleanly into Make
- [ ] Retrieval eval recall@5 ≥ 0.9 on 30-query golden set
- [ ] Per-user rate limiting in place

### M4 — Production hardening (Week 5)

- [ ] All security checklist items verified
- [ ] Sentry capturing errors
- [ ] Daily Slack summary working
- [ ] README explains how to run locally, run evals, deploy
- [ ] One operator runbook entry per failure code in `ingestion_runs.status`
- [ ] Load test: 100 concurrent chat requests, p95 latency < 4s

---

## 19. Things to deliberately defer

Do NOT build these in v1. Adding them now blows the timeline.

- Reranker (Cohere/BGE) — stub the interface but skip the call
- Multi-tenant invite flow — bootstrap memberships manually
- Scenario diff/versioning UI — only the latest analysis is shown
- Slack bot — web UI only
- Admin panel — Supabase dashboard is the admin panel
- Mobile-first design — desktop responsive is enough
- Internationalization — English only
- Custom Make API connection per user — single shared `MAKE_API_TOKEN` for the default org

---

## 20. Open questions for the human (resolve before starting M3)

1. What's the production domain? Affects Supabase Auth redirect URL config.
2. Should `/reuse` push directly to Make as a new scenario, or download-only for v1? (Default: download-only, safer.)
3. Who's the first set of users? Need their Google account emails to seed `user_org_memberships`.
4. What's the Make org ID for the initial deployment? Used as `MAKE_DEFAULT_ORG_ID`.
5. Sentry or another error tracker? (Default: Sentry free tier.)
6. Vercel team or personal account? Affects deploy config.

---

## 21. How to use this brief with Claude Code

1. Drop this file (`Build-Brief.md`) plus `AI-Architecture.md` and `UI-Recommendations.md` into the project root.
2. Open Claude Code in plan mode with Opus 4.7, high thinking.
3. Initial prompt:
   ```
   Read AI-Architecture.md, UI-Recommendations.md, and Build-Brief.md.
   Produce a detailed implementation plan for milestones M1–M4 as defined
   in Build-Brief §18. For each step, list the files you'll create or
   modify, the order, and any decisions you need from me before starting.
   Do not write code yet.
   ```
4. Review the plan. Push back on anything that deviates from the briefs.
5. Approve and let Claude Code execute one milestone at a time, verifying acceptance criteria between each.

---

*End of build brief. v1.0.*
