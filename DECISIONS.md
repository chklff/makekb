# DECISIONS.md
> Architecture & product decision log for **Make Scenarios KB**.
> Format: Date → Context → Options → Decision → Consequences

---

## 2026-05-21 — Project: Make Scenarios KB
**Status**: Decided
**Context**: An organization has hundreds of Make.com scenarios spread across teams/folders. People keep rebuilding the same automations because nobody knows what already exists. We need a semantic knowledge base over the full inventory with chat, browse, and reuse surfaces.
**Decision**: Build per `Build-Brief.md`. North-star is "do we already have a scenario that does X?" answered with grounded citations and one-click reuse.
**Consequences**: Single product focus. v1 = one Make org, one Supabase project (`ybabwpbxckqggjxnueeh`), Google SSO. v1.5 adds multi-tenant.

---

## 2026-05-21 — Tech Stack (locked)
**Status**: Decided — do not deviate without writing a new decision here
**Context**: Need a stack that supports SSR + auth + Postgres + vector search + Edge compute on a tiny budget with one engineer.
**Options considered**:
- Next.js + Supabase (chosen) — bundles auth + DB + storage + edge compute + pgvector
- Remix + Neon + separate vector store — more pieces, no auth bundled
- Python (FastAPI) + pgvector — slower iteration for the UI side
**Decision**:
- Frontend/API: **Next.js 15 App Router + React 19 + TypeScript (strict)**
- DB + Auth + Storage + Edge: **Supabase** (project `ybabwpbxckqggjxnueeh`)
- Vector: **pgvector with HNSW index** (migrate from existing IVFFlat on M1)
- LLM analysis/reuse: **Anthropic Claude Sonnet 4.5** pinned to `claude-sonnet-4-5-20250929`
- LLM chat/query understanding: **Anthropic Claude Haiku 4.5** pinned to `claude-haiku-4-5-20251001`
- Embeddings: **OpenAI `text-embedding-3-small`** (1536d)
- Streaming primitives: **Vercel AI SDK** (`useChat`, `streamText`) — Anthropic SDK used directly for structured-output analysis/reuse
- UI primitives: **shadcn/ui + Tailwind + lucide-react**
- Validation: **Zod**
- Tests: **Vitest**
- Package manager: **pnpm**; Node 20 LTS
**Consequences**: Single vendor for auth + DB + storage + edge functions = simpler ops. Same Anthropic API key powers analysis, chat, and reuse. Lock-in to Supabase + Anthropic; acceptable given a) `@anthropic-ai/sdk` is swappable behind `lib/llm/anthropic.ts`, b) Postgres + pgvector is portable.

---

## 2026-05-21 — Auth: Supabase Auth + Google OAuth only
**Status**: Decided
**Context**: Users are internal employees with Google Workspace accounts. We need org-scoped data isolation enforced server-side.
**Options considered**: NextAuth (too much custom code), Clerk (paid, overkill), custom JWT (too risky), Supabase Auth (chosen)
**Decision**: Supabase Auth + Google OAuth provider. Org access enforced via `user_org_memberships` table + RLS policies using a `user_org_ids()` SECURITY DEFINER function.
**Consequences**: First-time users must be manually added to `user_org_memberships` for v1 (no self-serve invite). Document a `scripts/grant-user-org-access.ts` helper. v1.5 adds invite flow.

---

## 2026-05-21 — Vector index: HNSW, not IVFFlat
**Status**: Decided
**Context**: Existing DB has `ivfflat` index on `make_scenarios.embedding`. IVFFlat needs training and degrades as the table grows past the trained `lists` size.
**Decision**: Migrate to **HNSW** with `m=16, ef_construction=64`. Self-organizing, better recall at small k, no re-training.
**Consequences**: Migration 1 in M1 drops the IVFFlat index and creates HNSW. Done before backfill. At query time set `hnsw.ef_search = 100` per session for better recall.

---

## 2026-05-21 — Hybrid retrieval (vector + FTS), not vector-only
**Status**: Decided
**Context**: Vectors are great for "syncs HubSpot deals to ads" but bad for exact terms like `make_scenario_id` or proper nouns.
**Decision**: Add a `tsvector` generated column over `scenario_name + one_line_summary + business_purpose + full_description` (weighted A/A/B/C). Score = `0.7 * vec_score + 0.3 * fts_score`. RPC `search_scenarios` returns ranked results. Filters pre-narrow candidate set via SQL.
**Consequences**: Adds Migration 2 (FTS column + GIN). Slightly larger row size; negligible at our scale. Reranker (Cohere/BGE) **deferred** — stub the interface, skip the call in v1.

---

## 2026-05-21 — Visual identity: Make brand purple gradient as primary, not UI-Rec's "info blue"
**Status**: Decided — overrides `UI-Recommendations.md` color section
**Context**: `UI-Recommendations.md` §"Color usage" calls for **info-blue** primary, but this is an internal Make tool and must follow Make brand. The mockup screenshots show blue because they were generic; the brand asset is `make-brand-guidelines`.
**Decision**: Override the color palette as follows while keeping every other UI-Rec principle (flat surfaces, 0.5px borders, two font weights, two-actions-per-surface, citations-as-content, sentence case, lucide icons).

| UI-Rec role | UI-Rec original | **Decision (Make brand)** |
| --- | --- | --- |
| Primary CTA / inline citation pill #1 | info blue | **Make signature gradient** `linear-gradient(135deg, #6C1FE5, #FF1F8E)` |
| Secondary citation pill / link | info blue lighter | **Make Purple solid** `#6C1FE5` |
| Page background | white/neutral | **Sand** `#F5F0E8` |
| Card / panel surface | white | **White** `#FFFFFF` (unchanged) |
| Card border | tertiary 0.5px | `rgba(108,31,229,0.12)` 0.5px |
| Card shadow | none | `0 2px 8px rgba(108,31,229,0.08)` |
| Body text on Sand | tertiary text | **Make Black** `#0D0D0D` |
| Reuse-notes warning block | amber | **amber** (unchanged — accessibility) |
| Match score ≥90% pill | green | **green** (unchanged — semantic) |
| Match score 70-89% pill | amber | amber (unchanged) |
| Match score <70% pill | red | red (unchanged) |
| "Adapt with AI" panel | info-tinted | **Pink-tint** `#FFE8F4` background, **Make Purple** accent |
| Sparkle icon for AI | info blue | **Gradient fill** |
| Border radius | 8/12px | 8/12px (unchanged) |
| Font | system | **Inter** (Google Fonts) |

CSS variables in `app/globals.css` will expose `--make-purple`, `--make-pink`, `--make-sand`, `--make-black`, `--make-gradient` etc.
**Consequences**: UI ships looking distinctly Make-branded rather than "another claude.ai clone." Semantic colors (success/warning/error) stay standard for accessibility. If a future design wants to revert to neutral, swap the CSS variables.

---

## 2026-05-21 — Two ingestion modes, but Edge Functions are the backbone
**Status**: Decided
**Context**: Mode A (Make.com scenario as orchestrator) is what was prototyped. Mode B (Edge Function batch crawler + worker) scales.
**Decision**: Build **Mode B first**. Mode A becomes a thin manual-trigger path: `/api/ingest/manual` enqueues into `ingestion_queue`, which the `ingest-worker` Edge Function pops.
**Consequences**: One source of truth for the pipeline (the worker). Make.com scenario can be added later in v1.5 if useful for demos.

---

## 2026-05-21 — Hash dedup is non-negotiable
**Status**: Decided
**Context**: A 500-scenario monthly re-sync costs $1.60 with hash dedup, $16 without. Dedup is also what enables prompt-version bumps without paying full backfill again.
**Decision**: SHA-256 of canonical JSON stored in `blueprint_hash`. Skip rule: `existing.hash == new.hash AND existing.llm_prompt_version == CURRENT_PROMPT_VERSION`. Forced re-analysis on either change.
**Consequences**: `PROMPT_VERSION` env var is the lever to force a full re-analyze. Document this.

---

## 2026-05-21 — Pattern library deferred to v1.5
**Status**: Decided
**Context**: §11 of architecture / Mockup 2's "Patterns" view. The clustering job is straightforward but needs ≥100 scenarios of real data before it produces meaningful clusters.
**Decision**: Build the **table** (`scenario_patterns`) and **Patterns toggle in /browse** in M2 (showing empty state), wire **`recompute-patterns` Edge Function** in M4 but don't enable the cron until v1.5 after we have data.
**Consequences**: Browse page ships with the Patterns/All toggle from day one. Patterns view starts as a "patterns coming after 100 scenarios ingested" empty state.

---

## 2026-05-21 — Deferred to v1.5 (do NOT build now)
**Status**: Decided
**Context**: Scope discipline. Build-Brief §19 enumerates these.
**Decision**: Do not build in v1:
- Reranker (Cohere/BGE) — stub `lib/retrieval/rerank.ts` interface only
- Multi-tenant invite flow
- Scenario diff/versioning UI
- Slack bot
- Admin panel (Supabase dashboard is the admin panel)
- Mobile-first design (desktop responsive only)
- i18n (English only)
- Per-user Make API tokens (single shared token for default org)
**Consequences**: If any of these get requested mid-flight, push back and reference this decision.

---

## 2026-05-21 — Three security advisor warnings accepted as by-design
**Status**: Decided
**Context**: After applying RLS migrations + revoking anon grants, 3 Supabase security-advisor warnings remain. All are `WARN` (not `ERROR`) and all are intentional.
**Decision**: Accept all three. Document here so a future audit doesn't re-litigate.

| Warning | Why it's fine |
| --- | --- |
| `extension_in_public` (vector) | Pre-existing. Moving it would require changing every `vector(1536)` column reference and breaking the HNSW index. Cost > benefit. Re-evaluate only if Supabase makes this an `ERROR`. |
| `pg_graphql_authenticated_table_exposed` (make_scenarios) | The `authenticated` role *must* have SELECT on `make_scenarios` for RLS to evaluate per-row. The policy "members read own org scenarios" then filters to the user's `org_id`s. Removing the SELECT grant would break RLS entirely. This is the standard Supabase RLS pattern. |
| `authenticated_security_definer_function_executable` (user_org_ids) | `user_org_ids()` *must* be executable by `authenticated` because every RLS policy calls it. It only ever returns the caller's own org IDs (filtered by `auth.uid()`), so it's safe by design. `SECURITY DEFINER` is required so the function can read `user_org_memberships` regardless of the caller's table-level grants. |

**Consequences**: Advisor will show 3 warnings forever. Document this in the operator runbook (M4.4) so on-call doesn't panic.

---

## 2026-05-21 — Defer pg_cron schedules until Edge Functions are deployed
**Status**: ~~Decided~~ **Superseded by 2026-05-22 "Walked back from Edge Functions"** — pg_cron is no longer in scope at all (no Edge Functions to schedule).
**Context**: Build-Brief §5.2 Migration 10 schedules nightly cron jobs that POST to `https://ybabwpbxckqggjxnueeh.supabase.co/functions/v1/ingest-batch` etc. Those functions don't exist yet.
**Decision**: Apply migrations 1-9 + observability views in M1.5-M1.15. **Defer** cron schedules to **M1.28** (after `supabase functions deploy`). Otherwise we'd schedule cron jobs against 404 endpoints, polluting `cron.job_run_details` with errors before anything works.
**Consequences**: One extra migration (`20260601_pg_cron_schedules.sql`) created at M1.28 instead of M1.15. Net-neutral on complexity.

---

## 2026-05-22 — Walked back from Supabase Edge Functions to plain Next.js routes
**Status**: Decided — **overrides Build-Brief §2, §5.2 Migration 10, §10 (Edge Functions), and §17 (cron schedules)**
**Context**: We built the three Deno Edge Functions (`ingest-worker`, `ingest-batch`, `embed-backfill`) per `Build-Brief.md`. In practice this caused:
- ~600 lines of duplicated code between `lib/` (Node) and `supabase/functions/_shared/` (Deno port)
- Two runtimes to debug — concrete bug: Anthropic SDK threw at module init in Deno because `apiKey` was undefined at deploy time
- A custom `EDGE_FUNCTION_SECRET` auth ceremony invented just to bridge Next.js ↔ Edge Functions
- Secrets split between Vercel (web) and Supabase Edge (functions) — two surfaces to rotate
- Two log streams to grep

For our workload (a few hundred LLM calls/month, ~5s/call Anthropic latency), Edge Functions added complexity for zero capability gain. Co-locating compute with Postgres saves no meaningful latency when the bottleneck is the LLM.

**Decision**: Ingestion runs in plain Next.js API routes (`/api/ingest/scenario`, `/api/ingest/batch`, `/api/ingest/embed-backfill`). All four reuse a single shared module `lib/ingest/run-scenario.ts`. No Deno. No second runtime. No `EDGE_FUNCTION_SECRET`. The 500-scenario one-time backfill runs locally via `pnpm tsx scripts/backfill.ts`.

**Scheduling**: **No cron in v1.** Admin clicks "Re-sync" in the UI when they want fresh data. Vercel Cron can be added in v1.5 if anyone misses it. This was an explicit user choice.

| | Old (Edge Functions) | New (Next.js routes) |
| --- | --- | --- |
| Runtimes | Node (web) + Deno (functions) | Node only |
| Code locations | `lib/` + `supabase/functions/_shared/` | `lib/` only |
| Auth model | Custom Bearer secret | Supabase session cookie (admin check) |
| Env vars | 17 | 16 (`EDGE_FUNCTION_SECRET` removed) |
| Deploy steps | `vercel deploy` + `supabase functions deploy` + `supabase secrets set` | `vercel deploy` |
| Logs | Vercel + Supabase Edge | Vercel only |
| Fresh-install steps for a new company | clone + .env + migrations + Supabase functions deploy + supabase secrets set + sign in + bootstrap | clone + .env + migrations + sign in + bootstrap |

**Consequences**:
- `supabase/functions/` directory deleted entirely.
- The 3 deployed Edge Functions (`ingest-worker` v1, `ingest-batch` v1, `embed-backfill` v1) on project `ybabwpbxckqggjxnueeh` will be deleted manually from the dashboard (or via MCP). They sit idle and harmless if not deleted.
- pg_cron schedules — never scheduled, never will be in v1. Migration was deferred and is now dropped entirely.
- The repo is now fresh-install-friendly: another company clones, fills env vars, runs migrations, signs in, clicks Re-sync. No Deno toolchain, no Supabase secrets to set besides the standard project keys.
- `Build-Brief.md` is now partially historical fiction. `DECISIONS.md` is the source of truth on conflicts.

---

## [Add new decisions below this line]
