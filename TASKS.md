# TASKS.md — Make Scenarios KB
> Daily kanban. Max 3 items "In Progress" at once. Finish before you start.
> See `PLAN.md` for the milestone view, `DECISIONS.md` for locked architectural choices, `CHANGELOG.md` for user-facing release notes.

---

## 🔴 In Progress

_(none — v0.1.1 shipped. Waiting on real-tester feedback to pick the next thing.)_

---

## 🟡 Up Next — v1.5 backlog (pick by tester signal)

### Capability gaps
- [ ] Pattern clustering job (needs ≥100 scenarios)  #backend
- [ ] Conversation history sidebar (replaces the removed History button)  #ui
- [ ] Direct import to Make from the Adapt panel (today: download JSON)  #backend
- [ ] Folder picker on the Re-sync UI button (today: CLI only)  #ui
- [ ] Signed-URL fetch for >500KB blueprints in Adapt panel  #backend

### Security follow-ups (deferred from v0.1 review)
- [ ] **SEC-H2** Per-user Make tokens replacing shared `MAKE_API_TOKEN`  #security #backend
- [ ] **SEC-H4** Org-scoped `make_users` RLS policy  #security #backend
- [ ] **SEC-M4** Auto-grant allowlist instead of blind domain trust  #security #backend
- [ ] **SEC-M5** Explicit CSRF tokens on state-changing POSTs  #security #backend
- [ ] Nonce-based CSP (drop `'unsafe-inline'` script-src)  #security #infra

### Ops / multi-tenant
- [ ] Multi-tenant invite flow replacing `grant-user-org-access.ts`  #ui #security
- [ ] Sentry in API routes  #infra
- [ ] Daily Slack summary cron (ingestion + chat + cost)  #infra
- [ ] Drift detection alert when `make_updated_at > reanalyzed_at` >24h  #backend
- [ ] Slack bot — chat inside Slack  #ui

### Quality bar
- [ ] 20-scenario eval set for analysis prompt, ≥90% match rate  #backend
- [ ] 30-query retrieval eval, recall@5 ≥ 0.9  #backend
- [ ] Load test: 100 concurrent chat requests, p95 < 4s  #infra
- [ ] Operator runbook — one entry per `ingestion_runs.status` failure code  #docs
- [ ] Reranker integration — only if retrieval recall drops  #backend

---

## ✅ Done

<!-- Move completed items here with date. Newest at top. Never delete — it's your build log. -->

- [x] 2026-05-25 — **v0.2.0 — Pattern clustering UI.** `/patterns` page with greedy nearest-neighbor clustering (cosine ≥ 0.85). Cards show cluster size, category, app variants, top-7 members with similarity %. Tunable `?threshold=` and `?demo=0`. Sidebar Patterns link live. North-Star demo: "do we have something like X?" now answerable at the pattern level.
- [x] 2026-05-25 — **v0.1.3 — Synthetic data for pattern-clustering prototyping.** `is_synthetic` column + RPC `p_include_synthetic` flag (chat + search default-exclude). `/browse?include_demo=1` shows them. Generator: 25 archetypes × app variant matrix → 500 rows balanced round-robin across 8 categories. Real OpenAI embeddings (~$0.005 total). Verified: within-archetype cosine ≥ 0.91 → clusters form cleanly.
- [x] 2026-05-25 — **v0.1.2 — Make-native description + interface.** `make_description` + `make_interface` columns on `make_scenarios`. `MakeClient.getScenarioInterface()`. Analysis prompt v1.1: factors human description (treated as highest-trust intent signal). Embedding input doubles description for retrieval weight. FTS column rebuilt with `make_description` at weight A. `PROMPT_VERSION` bumped → v1.1 forces re-analysis on next ingest.
- [x] 2026-05-25 — **v0.1.1 — Pre-customer polish.** Real Make org name in sidebar pill (replaces `scn-kb-prod` hardcode). Landing-page mailto removed (no scrapeable personal email in public bundle). Branded `app/not-found.tsx` 404 page. README rewritten with 5-step Vercel deploy section + the Supabase Auth URL gotcha that loops sign-in if missed + vendor-side hard caps guidance.
- [x] 2026-05-24 — **v0.1.0 SHIP-READY for testers.** In-app `/changelog` route rendering `CHANGELOG.md`. Sidebar version label links to it. README screenshot section + LICENSE (BSD-3-Clause). `.env.example` fully in sync with code (every `process.env.X` documented). Sidebar nav cleanup: removed dead Collections/Versions, marked Patterns/Connections/Settings as "Soon", removed dead History button from top bar. Fixed React duplicate-key warning in chat source cards (dedupe chips).
- [x] 2026-05-24 — **Second-pass security review.** All first-pass fixes verified end-to-end. New finding: `llm_call_log` missed the anon-revoke (caught by Supabase advisor) — fixed via migration `20260524000001_revoke_anon_llm_call_log.sql`. 5 `pnpm audit` CVEs reviewed, all non-exploitable in our threat model (dev-only deps or features we don't use). 3 advisor lints remain — all by-design, documented.
- [x] 2026-05-24 — **SEC-M6** CSP + 5 other security headers in `next.config.mjs`. Dev-aware (Turbopack HMR works), prod is strict.
- [x] 2026-05-24 — **SEC-M3** Chat history 90-day retention via pg_cron `chat-retention-cleanup` job, nightly 03:30 UTC.
- [x] 2026-05-24 — **SEC-M2** Prompt-injection sanitization on retrieved scenario content. Strips `</scenarios>` close tags, fake role headers, control chars, jailbreak phrasing. Per-scenario `<scenario index="N">` sub-blocks for clearer trust boundaries.
- [x] 2026-05-24 — **SEC-M1** Daily LLM budget enforcement. New `llm_call_log` table for chat + reuse spend. `cost-tracking.ts` sums from both tables with 60s memo cache. `assertWithinBudget()` actually called from chat + reuse routes before LLM dispatch.
- [x] 2026-05-24 — **SEC-H1** Per-user rate limiting on `/api/chat` (30/min), `/api/reuse` (5/min), `/api/search` (60/min) via `lib/rate-limit.ts`. Sliding window, auto-janitor.
- [x] 2026-05-24 — **SEC-H3** Storage `blueprints` bucket private + 10MB file cap.
- [x] 2026-05-24 — **SEC-H2/H4** documented as accepted risks for v1; v1.5 roadmap entries added.
- [x] 2026-05-24 — **Onboarding polish:** `docs/TESTERS.md` paste-into-Slack guide, landing page rewrite (auth-aware CTA, "When to use it", functional FAQ), feedback button styled + mailto template, `NEXT_PUBLIC_FEEDBACK_EMAIL` configurable.
- [x] 2026-05-23 — **M3.7** Auto-grant on first sign-in: `AUTO_GRANT_DOMAINS` for catchall member access + `AUTO_GRANT_ADMIN_EMAILS` for cross-domain admin overrides. Existing memberships never overwritten.
- [x] 2026-05-23 — **M3.6** Real Make org/team/folder names. `MakeClient.getOrganization()` + `getTeam()` + `findFolder()` with in-memory caching. `--folder=ID` flag on backfill. `folder_id` param on `/api/ingest/batch`.
- [x] 2026-05-23 — **M3.5** Browse polish: free-text search hits `/api/search`, four filter chip dropdowns (Team/App/Category/Complexity), match-score slider, URL-shareable state, stats tiles reflect query.
- [x] 2026-05-23 — **M3.D** `/api/reuse` POST with Sonnet 4.5 structured output. Adapt panel on detail page wired. Download blueprint JSON button.
- [x] 2026-05-23 — **M3.C** Real `/chat` UI: streaming NDJSON, `[N]` citation pills (clickable), source cards with match-% pills, suggested follow-ups.
- [x] 2026-05-23 — **M3.B** `/api/chat` POST streaming with Anthropic Haiku, query rewriting stub, RAG-grounded answer with citations. Persists to `chat_conversations` + `chat_messages`.
- [x] 2026-05-23 — **M3.A** `lib/retrieval/hybrid-search.ts` wraps the `search_scenarios` RPC. `/api/search` POST endpoint.
- [x] 2026-05-22 — **M2 EXIT CRITERIA MET.** Middleware (session refresh + protect `(app)/*`). OAuth callback + sign-out. Live Google sign-in button. Protected layout uses real session, polite empty state for no-org users. TopBar with user initials + admin-only Re-sync. Browse + scenario detail wired to real DB. Live-tested with real Google account.
- [x] 2026-05-22 — **M1 EXIT CRITERIA MET.** Ingested 5 real Make scenarios end-to-end (4594302, 91, 104, 85, 375789). All have `embedding NOT NULL`, structured analysis, hash, audit rows. Total cost ~$0.085. Hardening: `lib/utils/assert-server.ts` runtime stub; `scripts/_load-env.ts`; service_role grants migration (#11).
- [x] 2026-05-22 — M1.A–M1.E: **Walked back from Supabase Edge Functions to plain Next.js routes.** Deleted `supabase/functions/` tree, `scripts/deploy-functions.sh`, `EDGE_FUNCTION_SECRET`, `pnpm functions:deploy`. Added `lib/ingest/run-scenario.ts` (shared core), 4 ingest routes, `lib/auth/require-admin.ts`. Fresh-install scripts. `next.config.mjs` hostname now derived from `NEXT_PUBLIC_SUPABASE_URL`. README "Fresh install" section.
- [x] 2026-05-21 — **M1.16–M1.23:** core Next.js libs (Supabase clients ×3, Make API client, blueprint cleaner, hash util, all LLM prompts + schemas, Anthropic wrapper with structured output + retry + streaming, OpenAI embeddings, cost-tracking + budget guardrail, typed errors, logger, auth helpers). 19/19 unit tests pass.
- [x] 2026-05-21 — **M1.5–M1.15:** 9 SQL migrations applied to Supabase (HNSW, FTS, ingestion tables, chat history, patterns, memberships, RLS + 18 policies, anon-grant revoke, search RPC, observability views). TS types generated. Security advisor down from 5 → 3 warnings (3 remaining are by-design).
- [x] 2026-05-21 — **M1.1–M1.4:** Next.js 15 + TS + Tailwind + shadcn scaffolded. ESLint + Prettier + Vitest configured. `.env.example` + `.gitignore`. Brand-styled shell pages all 200 OK. `pnpm install` clean (192 packages).
- [x] 2026-05-21 — Credentials confirmed (Anthropic / OpenAI / Make / Supabase service role).
- [x] 2026-05-21 — Project management docs (PLAN, TASKS, DECISIONS) repurposed for Make Scenarios KB.

---

## 📋 Rules

- One item per line. Use `#area` tags: `#backend` `#ui` `#infra` `#security` `#docs`
- Tasks belong to milestones (M1.x, M2.x, …, v1.5) so progress maps cleanly to `PLAN.md`
- Never delete "Done" items — they're your build log
- A milestone is **complete** only when its exit criteria in `PLAN.md` are met
- Review this file every morning (60 seconds max)
- **Every shipped chunk ends with a TEST PLAN** — numbered steps + explicit expected outcomes. See `AGENTS.md` Rule 2.
- **Pause at agreed checkpoints.** Don't roll the next milestone in silently. See `AGENTS.md` Rule 3.
- **Bump `package.json` version + add a `CHANGELOG.md` entry** on each meaningful release.
