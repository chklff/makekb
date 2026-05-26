# PLAN.md — Make Scenarios KB
> North-star roadmap. Milestones, not Gantt charts.
> Sequencing of *what we build, in what order*. See `README.md` for install, `DECISIONS.md` for locked architectural choices, `TASKS.md` for the daily kanban.

---

## Vision

**Make Scenarios KB** helps Make.com power users stop rebuilding scenarios they already have. Ask "do we have something like X?" — get a grounded answer with clickable citations, one-click open in Make, or one-click "adapt this for Pipedrive instead." Backed by Claude Sonnet 4.5 analysis of every blueprint, pgvector hybrid search, RLS-scoped to the user's Make org.

**North Star Metric:** weekly active users who click **Reuse** or **Open in Make** from a citation (i.e. the KB actually saved them from rebuilding something).

---

## Reference docs

- `DECISIONS.md` — locked architectural choices (authoritative on conflicts)
- `TASKS.md` — daily kanban + chronological build log
- `AGENTS.md` — operating rules for AI engineers
- `CHANGELOG.md` — user-facing release notes (rendered at `/changelog`)
- `README.md` — install + run
- `docs/TESTERS.md` — 5-minute paste-into-Slack guide for testers
- `docs/archive/` — original Build-Brief + AI-Architecture (historical, see archive README)

---

## Phase 0 — Foundation ✅ DONE 2026-05-21

- [x] Supabase project `ybabwpbxckqggjxnueeh` created with 5 reference tables + `make_scenarios` (43 cols) + pgvector
- [x] Architecture + UI + Build-Brief docs locked
- [x] Stack decisions captured (`DECISIONS.md`)

---

## M1 — Ingestion working end-to-end ✅ DONE 2026-05-22

> *"One scenario goes in, complete analysed row + embedding comes out."*

- [x] Next.js 15 + TS + Tailwind + shadcn scaffolded
- [x] 16 SQL migrations applied (HNSW, FTS, ingestion tables, chat history, patterns, memberships, RLS + 18 policies, anon-revoke, search RPC, observability views, service_role grants, `llm_call_log`, chat-retention pg_cron, llm_call_log anon-revoke)
- [x] `lib/make/clean-blueprint.ts` + 11 unit tests; `lib/utils/hash.ts` + 8 unit tests
- [x] `lib/llm/anthropic.ts` + `openai-embeddings.ts` + structured output via tool-use
- [x] `lib/ingest/run-scenario.ts` — single shared module callable from API routes + CLI
- [x] 4 ingest API routes (`scenario`, `batch`, `embed-backfill`, `manual`) — admin-gated
- [x] `scripts/{backfill,setup-db,grant-user-org-access,refresh-meta,test-search,test-reuse}.ts`
- [x] **26 real scenarios ingested end-to-end** — all with `embedding NOT NULL`, structured analysis, hash, audit rows

**Architecture revision (2026-05-22):** Walked back from Supabase Edge Functions to plain Next.js API routes. See `DECISIONS.md`.

---

## M2 — Auth + browse working ✅ DONE 2026-05-22

> *"A signed-in user can browse their org's scenarios with filters and drill into details."*

- [x] Google OAuth via Supabase Auth working in dev
- [x] `middleware.ts` session refresh + protected-route redirects
- [x] `app/(app)/layout.tsx` — protected, loads user-context, polite empty state for users with no org membership
- [x] TopBar with real scenario/pattern counts, user-menu dropdown, sign-out
- [x] `/browse` Server Component with real RLS-scoped Postgres query
- [x] `/scenarios/[id]` detail page renders all LLM analysis fields + at-a-glance metadata
- [x] Make-brand design system applied to all surfaces

**Exit criteria met.**

---

## M3 — Chat + reuse + browse polish ✅ DONE 2026-05-23

> *"Ask a question, get a grounded answer with citations. Click reuse, get a Pipedrive variant."*

- [x] `lib/retrieval/hybrid-search.ts` calls `search_scenarios` RPC
- [x] `/api/search` POST with Zod validation
- [x] `/api/chat` POST streaming (NDJSON) with citation pills + source cards
- [x] `/api/reuse` POST with Sonnet 4.5 — returns `{ new_blueprint, change_summary, warnings }`
- [x] `/chat` UI: streaming text, `[N]` citation pills, source cards with match-% pills, suggested follow-ups
- [x] Adapt panel on detail page wired to `/api/reuse`; download blueprint JSON
- [x] **M3.5 — Browse polish:** working search, 4 filter chip dropdowns (Team/App/Category/Complexity), match-score slider, URL-shareable state
- [x] **M3.6 — Real Make names:** org/team/folder names pulled from Make API with caching
- [x] **M3.7 — Auto-grant on first sign-in:** `AUTO_GRANT_DOMAINS` + `AUTO_GRANT_ADMIN_EMAILS`

**Exit criteria met.**

---

## v0.2.1 — Similar tile + pattern detail + folder picker ✅ DONE 2026-05-25

> *"Closing day-one usability gaps."*

- [x] "Similar scenarios" tile on `/scenarios/[id]` — top 5 neighbors with similarity %
- [x] `/patterns/[seedId]` detail page — full member list + threshold tuner + reuse actions
- [x] Folder picker on Re-sync UI button (closes CLI-only gap)
- [x] `GET /api/folders` admin endpoint
- [x] Pattern card on `/patterns` clickable to detail

---

## v0.2.0 — Pattern clustering UI ✅ DONE 2026-05-25

> *"The North-Star feature: stop rebuilding what already exists."*

- [x] Greedy nearest-neighbor clustering algorithm in `lib/clustering/greedy.ts`
- [x] `/patterns` route — grid of pattern cards, member list with similarity %, Reuse CTA
- [x] Tunable threshold via `?threshold=0.85` (default 0.85; lower = wider clusters)
- [x] Demo data shown by default on this page (different from `/browse`)
- [x] Sidebar Patterns link no longer "Soon"
- [x] Validated on real + synthetic mix (527 rows → ~25 pattern cards)

---

## v0.1.3 — Synthetic data for pattern-clustering ✅ DONE 2026-05-25

> *"Prototype /patterns without waiting for 100 real scenarios."*

- [x] `is_synthetic` column on `make_scenarios` + index
- [x] `search_scenarios` RPC: `p_include_synthetic` flag (default false)
- [x] Chat + `/api/search` never include synthetic
- [x] `/browse` hides by default; `?include_demo=1` shows them
- [x] Generator script: 25 archetypes × app variants, round-robin merged → balanced 500 rows
- [x] All 8 categories represented (sales 100 / support 80 / devops/ecommerce/marketing/finance 60 each / data-sync 40 / hr 40)
- [x] Real OpenAI embeddings — clustering verified (within-archetype cosine ≥ 0.91)

---

## v0.1.2 — Make-native description + interface ✅ DONE 2026-05-25

> *"Stop ignoring metadata Make already gives us for free."*

- [x] `MakeClient.getScenarioInterface()` — fetches `/scenarios/{id}/interface` (webhook + sub-scenario I/O spec)
- [x] DB columns `make_description` + `make_interface` on `make_scenarios`
- [x] FTS column rebuilt to include `make_description` at weight `'A'`
- [x] Analysis prompt v1.1 — passes `HUMAN DESCRIPTION` + `INTERFACE` blocks to Sonnet
- [x] Embedding input doubles the description text when present (retrieval weight)
- [x] `PROMPT_VERSION=v1.1` — next ingest re-analyses every scenario

---

## v0.1.1 — Pre-customer polish ✅ DONE 2026-05-25

> *"Last clean-up before the URL goes out."*

- [x] Sidebar pill shows real Make org name (no more `scn-kb-prod` hardcode)
- [x] Landing-page mailto removed (no scrapeable personal email in public bundle)
- [x] Branded 404 page (`app/not-found.tsx`)
- [x] README deploy section: 5-step Vercel deploy + Supabase Auth URL whitelist gotcha + vendor-side hard-cap guidance
- [x] README install step 4 clarified (Google Cloud Console vs Supabase URL Configuration split)

---

## v0.1.0 — Tester beta ✅ DONE 2026-05-24

> *"Ship-ready for non-team testers."*

### Security hardening (two-pass review)

- [x] **H1** Rate limits: `/api/chat` 30/min, `/api/reuse` 5/min, `/api/search` 60/min — sliding window in-memory, auto-janitor
- [x] **H3** Storage `blueprints` bucket private + 10MB file cap
- [x] **M1** Daily LLM budget enforced via `llm_call_log` + `assertWithinBudget()` at every paid call site; 60s memo cache
- [x] **M2** Prompt-injection sanitization on retrieved scenario content
- [x] **M3** Chat history 90-day retention via pg_cron (nightly 03:30 UTC)
- [x] **M6** CSP + HSTS + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy
- [x] Catch-up: revoke anon SELECT on `llm_call_log`
- [x] **Accepted-risks docs:** H2 (shared Make token), H4 (`make_users` world-read for authed), M4 (auto-grant by domain), M5 (no explicit CSRF tokens) — all logged in `DECISIONS.md` with v1.5 reactivation plan

### Onboarding + UX polish

- [x] `docs/TESTERS.md` — paste-into-Slack 5-step guide
- [x] Auto-grant on first sign-in (member by domain, admin by email override)
- [x] Landing page rewrite: auth-aware CTA, "When to use it" jobs-to-be-done, functional FAQ
- [x] Sidebar cleanup: removed Collections/Versions/History (mockup leftovers); Patterns/Connections/Settings marked "Soon"
- [x] Sidebar "Give feedback" button: visible purple-tint, pre-filled mailto body template
- [x] In-app `/changelog` page that renders `CHANGELOG.md`; sidebar version label
- [x] Branded `/sign-in` and "No org access yet" empty state
- [x] README rewritten as proper install + use guide
- [x] LICENSE (BSD-3-Clause)
- [x] `.env.example` in sync with code (every `process.env.X` documented)

### Cleanups

- [x] Removed dead `EDGE_FUNCTION_SECRET` references everywhere
- [x] Removed `.github/workflows/` (CI is overkill for solo dev; Vercel build is the gate)
- [x] Archived `Build-Brief.md` + `AI-Architecture.md` to `docs/archive/`
- [x] Fixed React duplicate-key bug in chat source cards (dedupe chips before render)

---

## v1.5 — Next round 🔲

> *"Ship after first round of real-user feedback."*
> No deadline. Order by user feedback, not by checklist.

### Capability gaps

- [x] ~~Pattern clustering~~ — shipped in v0.2.0
- [ ] **Conversation history sidebar** — list past chats, click to resume; replaces the removed History button
- [ ] **Direct import to Make** from the Adapt panel via Make API (today: download JSON, paste manually)
- [x] ~~Folder picker on Re-sync UI button~~ — shipped in v0.2.1
- [ ] **Storage signed-URL fetch** for >500KB blueprints so the Adapt panel works on huge scenarios (today: errors out with `blueprint_in_storage`)
- [ ] **Reranker** (Cohere `rerank-v3` or self-hosted BGE) — only if retrieval recall@5 drops below 0.9 on a 30-query eval set

### Security follow-ups

- [ ] **H2 — Per-user Make tokens** (replace shared `MAKE_API_TOKEN`). Today the token reads the whole org regardless of who's signed in.
- [ ] **H4 — Org-scoped `make_users` policy.** Today: any authenticated user can list all Make users across the instance.
- [ ] **M4 — Auto-grant allowlist** (`AUTO_GRANT_ALLOWED_EMAILS`) or cross-check against `make_users`. Today: trust the Google Workspace domain blindly.
- [ ] **M5 — Explicit CSRF tokens** on state-changing POSTs. Today: SameSite=Lax cookies considered sufficient for internal use.
- [ ] **Nonce-based CSP** — drop `'unsafe-inline'` from `script-src`. Requires middleware-based nonce injection.

### Ops / multi-tenant

- [ ] **Multi-tenant invite flow** — admin invites teammates by email, replaces the manual `grant-user-org-access.ts` script
- [ ] **Per-user roles / permissions** beyond `member` / `admin` — scenario-level or team-level scoping inside the KB
- [ ] **Sentry** capturing errors from API routes
- [ ] **Daily Slack summary cron** with ingestion + chat + cost numbers
- [ ] **Drift detection alert** when `make_updated_at > reanalyzed_at` for >24h
- [ ] **Slack bot** — same chat experience inside Slack

### Quality bar

- [ ] **20-scenario eval set** for the analysis prompt with ≥90% match rate (currently: no automated quality bar)
- [ ] **30-query retrieval eval** with recall@5 ≥ 0.9
- [ ] **Load test:** 100 concurrent chat requests, p95 < 4s
- [ ] **Operator runbook** — one entry per `ingestion_runs.status` failure code

---

## 🚦 Constraints

- **Solo engineer + Claude Code** for v0.1
- **Budget:** ~$85/month all-in for a 500-scenario org. Daily LLM cap: `DAILY_LLM_BUDGET_USD=20` (enforced before every paid call)
- **Hard rule:** don't start v1.5 work until tester feedback identifies the actual highest-leverage item
- **Hard rule:** do not deviate from `DECISIONS.md` without writing a new decision

---

## 💡 Parking lot (don't build yet)

- [ ] Mobile-first design — desktop is enough for v1
- [ ] i18n
- [ ] Self-serve Make API token rotation (per-user OAuth to Make)
- [ ] Public link / share a scenario summary externally
- [ ] Admin panel UI (Supabase dashboard works for v1)
- [ ] Embedded "ask the KB" widget for other tools
- [ ] Scenario versioning / blueprint diff viewer
