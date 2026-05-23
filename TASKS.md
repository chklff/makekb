# TASKS.md — Make Scenarios KB
> Daily kanban. Max 3 items "In Progress" at once. Finish before you start.
> See `PLAN.md` for the milestone view, `DECISIONS.md` for locked architectural choices.

---

## 🔴 In Progress
- [ ] **M2 — Live browser test** *(code written; blocked on user enabling Google OAuth in Supabase dashboard + Google Cloud Console, then we bootstrap admin membership and sign in)*

---

## 🟡 Up Next — M1: Ingestion working end-to-end (Week 1-2)

### Repo & tooling
- [x] **M1.1** Scaffold Next.js 15 + TS + Tailwind + pnpm at repo root — **2026-05-21**  #infra
- [x] **M1.2** Add ESLint, Prettier, tsconfig strict, .env.example, .gitignore — **2026-05-21**  #infra
- [x] **M1.3** Install runtime deps (`@supabase/ssr`, `@anthropic-ai/sdk`, `openai`, `ai`, `zod`, `lucide-react`, shadcn primitives) — **2026-05-21**  #infra
- [x] **M1.4** Make-brand design system + shell pages (`/`, `/sign-in`, `/chat`, `/browse`, `/scenarios/[id]`, `/api/health`) — **2026-05-21**  #ui

### Database migrations (run against Supabase project `ybabwpbxckqggjxnueeh`)
- [x] **M1.5** Migration 1 — HNSW index — **2026-05-21**  #backend
- [x] **M1.6** Migration 2 — `search_text` tsvector + GIN, GIN on `use_cases` — **2026-05-21**  #backend
- [x] **M1.7** Migration 3 — `ingestion_runs` + `ingestion_queue` — **2026-05-21**  #backend
- [x] **M1.8** Migration 4 — `chat_conversations` + `chat_messages` — **2026-05-21**  #backend
- [x] **M1.9** Migration 5 — `scenario_patterns` — **2026-05-21**  #backend
- [x] **M1.10** Migration 6 — `user_org_memberships` — **2026-05-21**  #backend
- [x] **M1.11+M1.12** Migration 7 — RLS enable + 18 policies + `user_org_ids()` helper — **2026-05-21**  #backend #security
- [x] **M1.12b** Defense-in-depth: revoked `anon` grants — **2026-05-21**  #security
- [x] **M1.13** Migration 9 — `search_scenarios` RPC — **2026-05-21**  #backend
- [x] **M1.31** Observability views (`vw_ingestion_health`, `vw_daily_spend`) — pulled forward from M4 — **2026-05-21**  #backend
- ~~**M1.14** Migration 10 — `pg_cron` schedules~~ — **DROPPED 2026-05-22** (no Edge Functions to schedule; see DECISIONS.md)  #backend
- [x] **M1.15** Generated TS types → `lib/supabase/types.ts` + `scripts/generate-types.sh` — **2026-05-21**  #backend

### Core libs (Next.js side)
- [x] **M1.16** `lib/supabase/{server,client,service}.ts` + `lib/auth/{get-session,require-session}.ts` — **2026-05-21**  #backend #security
- [x] **M1.17** `lib/make/types.ts` + `lib/make/client.ts` — **2026-05-21**  #backend
- [x] **M1.18** `lib/make/clean-blueprint.ts` + 11 unit tests — **2026-05-21**  #backend
- [x] **M1.19** `lib/utils/hash.ts` (canonical JSON SHA-256) + 8 unit tests — **2026-05-21**  #backend
- [x] **M1.20** `lib/llm/prompts/{analysis-system,analysis-schema,chat-system,query-understanding,reuse-system}.ts` — **2026-05-21**  #backend
- [x] **M1.21** `lib/llm/anthropic.ts` (structured output + retry + cost + stream) + `lib/llm/routing.ts` + `lib/llm/cost-tracking.ts` — **2026-05-21**  #backend
- [x] **M1.22** `lib/llm/openai-embeddings.ts` (single + batch + cost) — **2026-05-21**  #backend
- [x] **M1.23** `lib/utils/{logger,errors}.ts` — **2026-05-21**  #backend

### ~~Edge Functions~~ — **DROPPED 2026-05-22** (see DECISIONS.md)
Replaced by plain Next.js API routes that reuse `lib/`. No Deno, no `EDGE_FUNCTION_SECRET`, no `supabase functions deploy`.

### Ingestion in Next.js (replaces M1.24–M1.30)
- [ ] **M1.A** Update docs (DECISIONS, PLAN, TASKS, AGENTS, README) for the reversal  #docs
- [ ] **M1.B** Delete `supabase/functions/` tree + `scripts/deploy-functions.sh` + `EDGE_FUNCTION_SECRET` + `pnpm functions:deploy`  #infra
- [ ] **M1.C** `lib/ingest/run-scenario.ts` — shared Node module: fetch from Make → clean → hash → analyze → embed → upsert + audit log  #backend
- [ ] **M1.D** API routes: `app/api/ingest/{scenario,batch,embed-backfill}/route.ts` + rewrite `app/api/ingest/manual/route.ts` to call `run-scenario.ts` directly  #backend
- [ ] **M1.E** Fresh-install scripts: `scripts/{backfill,setup-db,grant-user-org-access}.ts` + parametrize `next.config.mjs` hostname  #infra
- [ ] **M1.F** Verify `pnpm typecheck && pnpm test && pnpm build` all green; delete 3 deployed Edge Functions from Supabase  #infra

### Observability for M1
- [x] **M1.31** SQL views `vw_ingestion_health`, `vw_daily_spend` — **2026-05-21**  #backend

---

## ⚪ Backlog — M2: Auth + browse (Week 3)

- [ ] **M2.1** Supabase Auth Google provider configured (dashboard, one-time)  #infra
- [ ] **M2.2** `middleware.ts` with session refresh + route protection  #backend #security
- [ ] **M2.3** `app/(auth)/sign-in/page.tsx` + Google button (client)  #ui
- [ ] **M2.4** `app/api/auth/callback/route.ts`  #backend
- [ ] **M2.5** `app/(app)/layout.tsx` protected layout, top bar (KB name, scenario count, Browse, History)  #ui
- [ ] **M2.6** `scripts/grant-user-org-access.ts` helper for manual membership bootstrapping  #infra
- [ ] **M2.7** `/browse` page — Server Component with filter chips, segmented control, stats tiles, pattern cards (empty state for patterns in v1)  #ui
- [ ] **M2.8** `/scenarios/[id]` page — two-column layout, business purpose / data flow / reuse-notes / actions / at-a-glance / same-pattern  #ui
- [ ] **M2.9** Make-brand design system applied to all surfaces (sand bg, purple gradient CTAs, Inter, 0.5px borders)  #ui
- [ ] **M2.10** Verify RLS with two test users from different orgs  #security

---

## ⚪ Backlog — M3: Chat + reuse (Week 4)

- [ ] **M3.1** `lib/retrieval/hybrid-search.ts` calls `search_scenarios` RPC  #backend
- [ ] **M3.2** `lib/retrieval/query-rewrite.ts` — Haiku-based filter extraction  #backend
- [ ] **M3.3** `lib/retrieval/rerank.ts` — stub interface (no implementation in v1)  #backend
- [ ] **M3.4** `app/api/search/route.ts` POST with Zod validation  #backend
- [ ] **M3.5** `app/api/chat/route.ts` POST streaming with Anthropic Haiku  #backend
- [ ] **M3.6** `app/api/reuse/route.ts` POST with Anthropic Sonnet  #backend
- [ ] **M3.7** `app/(app)/chat/page.tsx` + `chat-client.tsx` — useChat hook, citation pills, source cards, suggested follow-ups  #ui
- [ ] **M3.8** `adapt-panel.tsx` on detail page — wired to `/api/reuse`  #ui
- [ ] **M3.9** "Generated variant review" page — change summary, warnings, JSON diff, download/import  #ui
- [ ] **M3.10** Rate limiting middleware (Vercel KV sliding window, 30 req/min/user) on `/api/chat` + `/api/reuse`  #backend #security
- [ ] **M3.11** Retrieval eval — 30 queries → recall@5 ≥ 0.9  #backend
- [ ] **M3.12** Vercel deploy + smoke test in production  #infra

---

## ⚪ Backlog — M4: Production hardening (Week 5)

- [ ] **M4.1** Sentry SDK in API routes (Edge Functions dropped — see DECISIONS.md)  #infra
- [ ] **M4.2** Daily Slack summary cron (ingestion + chat + cost)  #infra
- [ ] **M4.3** `README.md` — local setup, evals, deploys  #docs
- [ ] **M4.4** Operator runbook — one entry per `ingestion_runs.status` failure code  #docs
- [ ] **M4.5** Load test: 100 concurrent chat requests, p95 < 4s  #infra
- [ ] **M4.6** CI: lint + typecheck + test + analysis evals on prompt PRs  #infra
- [ ] **M4.7** Security checklist verification (Build-Brief §16)  #security
- [ ] **M4.8** `app/api/cron/recompute-patterns/route.ts` — pattern clustering job (v1.5, disabled in v1)  #backend

---

## ⚪ Stretch / v1.5

- [ ] Pattern library cron enabled  #backend
- [ ] Reranker integration  #backend
- [ ] Multi-tenant invite flow  #ui #security
- [ ] Scenario versioning UI  #ui
- [ ] Slack bot  #ui
- [ ] Direct import to Make via API  #backend
- [ ] Drift detection alert  #backend

---

## ✅ Done

<!-- Move completed items here with date. Newest at top. -->
- [x] 2026-05-22 — **M2 code complete.** Middleware (session refresh + route protection + redirect to /sign-in for unauthed). OAuth callback + sign-out routes. Live Google sign-in button. Protected `(app)/layout.tsx` uses real session, hits `getAppUserContext()` for memberships + counts. Empty-state for users with no org membership. TopBar shows user initials, dropdown with sign-out, admin-only Re-sync button that POSTs to `/api/ingest/batch`. Browse page wired to RLS-scoped Postgres query. Scenario detail page renders real `business_purpose`, `data_flow`, `branches_summary`, `error_handling`, `reuse_notes` (parsed into bullets), at-a-glance metadata, tags. 13 routes compile. Live test pending Supabase dashboard config.
- [x] 2026-05-22 — **M1 EXIT CRITERIA MET.** Ingested 5 real Make scenarios end-to-end (4594302, 91, 104, 85, 375789). All have `embedding NOT NULL`, structured analysis, hash, audit rows. Total cost ~$0.085. Pipeline verified: Make API → cleaner → Anthropic Sonnet 4.5 → OpenAI embeddings → Supabase upsert + audit. Hardened along the way: `server-only` → `lib/utils/assert-server.ts` runtime stub (works in Next + scripts); `scripts/_load-env.ts` (reads .env.local like Next does); service_role grants migration (#11); 4 ingest API routes + admin gate.
- [x] 2026-05-22 — M1.A–M1.E: **Walked back from Supabase Edge Functions to plain Next.js routes.** Deleted `supabase/functions/` tree, `scripts/deploy-functions.sh`, `EDGE_FUNCTION_SECRET`, `pnpm functions:deploy`. Added `lib/ingest/run-scenario.ts` (shared core), 4 ingest routes (`scenario`, `batch`, `embed-backfill`, `manual`), `lib/auth/require-admin.ts` (admin gate). Fresh-install scripts: `backfill.ts`, `setup-db.ts`, `grant-user-org-access.ts`. `next.config.mjs` hostname now derived from `NEXT_PUBLIC_SUPABASE_URL`. README "Fresh install" section. Build green: 11 routes, 19/19 tests. (3 idle edge functions on `ybabwpbxckqggjxnueeh` still need manual delete from dashboard — they're inert without secrets.)
- [x] 2026-05-21 — M1.16–M1.23: core Next.js libs (Supabase clients ×3, Make API client, blueprint cleaner, hash util, all LLM prompts + schemas, Anthropic wrapper with structured output + retry + streaming, OpenAI embeddings wrapper, cost-tracking + budget guardrail, typed errors, logger, auth helpers). 19/19 unit tests pass, typecheck clean, build green.
- [x] 2026-05-21 — M1.5–M1.15: 9 SQL migrations applied to Supabase (HNSW, FTS, ingestion tables, chat history, patterns, memberships, RLS + 18 policies, anon-grant revoke, search RPC, observability views). TS types generated. M1.14 (cron) deferred to post-edge-deploy. Security advisor down from 5 → 3 warnings (3 remaining are by-design — see DECISIONS.md).
- [x] 2026-05-21 — M1.4: brand-styled shell (landing + sign-in + chat + browse + scenario detail + api/health, all 200 OK)
- [x] 2026-05-21 — M1.3: pnpm install (192 packages, build approvals for esbuild/sharp/unrs-resolver)
- [x] 2026-05-21 — M1.2: ESLint + Prettier + tsconfig strict + .env.example + .gitignore + Vitest config
- [x] 2026-05-21 — M1.1: Next.js 15 + TS + Tailwind + shadcn primitives scaffolded; `pnpm build` green
- [x] 2026-05-21 — M1.0: credentials confirmed (Anthropic / OpenAI / Make / Supabase service role all present)
- [x] 2026-05-21 — Project management docs (PLAN, TASKS, DECISIONS) repurposed for Make Scenarios KB

---

## 📋 Rules
- One item per line. Use `#area` tags: `#backend` `#ui` `#infra` `#security` `#docs`
- Tasks belong to milestones (M1.x, M2.x, …) so progress maps cleanly to `PLAN.md`
- Never delete "Done" items — they're your build log
- A milestone is **complete** only when its exit criteria in `PLAN.md` are met
- Review this file every morning (60 seconds max)
- **Every shipped chunk ends with a TEST PLAN** — numbered steps + explicit expected outcomes. See `AGENTS.md` Rule 2.
- **Pause at agreed checkpoints.** Don't roll the next milestone in silently. See `AGENTS.md` Rule 3.
