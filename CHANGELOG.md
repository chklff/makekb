# Changelog

All notable changes to Scenario KB are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project loosely follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-05-25 — /patterns page with automatic clustering

The KB now answers the North-Star question — "do we have something like X?" — at the **pattern** level, not just the scenario level.

### Added

- **`/patterns` route** — grid of pattern cards. Each card = a group of scenarios that solve the same problem with different apps. Click any variant to open it; "Reuse →" opens the cleanest example in Adapt mode.
- **Greedy clustering algorithm** (`lib/clustering/greedy.ts`) — for each ungrouped scenario, find neighbors within cosine ≥ 0.85, that's a cluster; repeat until done. Deterministic, no clustering library dependency, runs server-side per request (<2s for 500+ rows).
- **Tunable threshold** — `/patterns?threshold=0.75` widens, `?threshold=0.92` tightens.
- **Demo toggle** — `/patterns` shows real + synthetic by default (this is the page where demo data is meant to be visible). `/patterns?demo=0` for real-only.
- **Pattern card UX:** cluster size pill, category badges, trigger-app variant chips, top-7 member list with similarity percent, mix indicator (real-only / synthetic-only / mixed).
- **Sidebar** — Patterns no longer marked "Soon"; live link.

### Why this matters

This is the slide-worthy demo. With 500 synthetic scenarios across 25 archetypes, the page surfaces ~25 clean pattern cards showing CRM × notification-channel families, ticketing × routing families, payment × dunning families. Visual proof that the KB compresses duplicate work — exactly the value prop in `PLAN.md` North Star.

---

## [0.1.3] — 2026-05-25 — Synthetic data for pattern-clustering prototyping

Generate realistic demo data without waiting for the org to grow to 100+ scenarios.

### Added

- **`is_synthetic` column** on `make_scenarios` — synthetic rows always flagged.
- **`search_scenarios` RPC** new `p_include_synthetic` parameter (default `false`) — chat + search never cite synthetic rows.
- **`/browse?include_demo=1`** — opt-in toggle to show synthetic data in browse. Default hides them.
- **`scripts/generate-synthetic-scenarios.ts`** — 25 archetypes × app variant matrix produces ~1019 realistic scenarios; trims to N (default 500) via round-robin across archetype families so coverage stays balanced (all 8 categories represented). Real OpenAI embeddings (~$0.005 total). No Sonnet/Haiku.
- **pnpm scripts:** `synth:generate` + `synth:purge`.

### Verified

- All 500 rows have real 1536-dim embeddings.
- Cosine similarity inside an archetype family ≥ 0.91 across all app-axis variants → tight clusters form.
- Real-org retrieval unaffected: chat + search default-exclude synthetic.

### Migration

- `20260525000002_synthetic_data_support.sql` — column + index + RPC signature.

---

## [0.1.2] — 2026-05-25 — Use Make's native description + interface

Capture the metadata Make's API already exposes and we were ignoring.

### Added

- **`make_description` column** on `make_scenarios` — the free-text "scenario settings → description" field humans write in Make. Where filled it's the best single signal of intent.
- **`make_interface` column** on `make_scenarios` — JSON payload from `GET /scenarios/{id}/interface`. Webhook input schema for triggered scenarios + output schema for sub-scenarios.
- **`MakeClient.getScenarioInterface(id)`** — new client method, swallows 404 (most scenarios don't expose an interface).
- **Analysis prompt v1.1** — now factors in `HUMAN DESCRIPTION` block (treated as highest-trust intent signal, flagged in `reuse_notes` if it contradicts the blueprint) and `INTERFACE` block. `PROMPT_VERSION` bumped to `v1.1` — next ingest will re-analyse every scenario (hash dedup is by-design defeated for prompt changes).
- **Embedding input** now prepends the human description twice when present, weighting the author's own words highest for retrieval.
- **FTS column** rebuilt to include `make_description` at weight `'A'` (same tier as `scenario_name`).

### Migration

- `20260525000001_make_description_and_interface.sql` — adds the two columns + drops/recreates `search_text` generated column + GIN index.

---

## [0.1.1] — 2026-05-25 — Pre-customer polish

Tightening pass before sharing the URL with first testers.

### Changed

- **Sidebar org pill** now shows the real Make organization name (pulled from `make_organizations.org_name`) instead of the hardcoded `scn-kb-prod` placeholder.
- **Landing page footer** no longer exposes a personal email mailto — replaced with a "Sign in to send feedback" note. Signed-in users still get the env-driven feedback button in the sidebar.
- **README** rewritten deploy section: 5-step Vercel deploy, the Supabase Auth URL gotcha that breaks OAuth if missed, vendor-side hard caps as defense-in-depth alongside `DAILY_LLM_BUDGET_USD`.
- **Step 4 of install** clarified: Google Cloud Console only needs the Supabase callback; your app URL goes in Supabase's Redirect URLs whitelist.

### Added

- **Branded 404 page** (`app/not-found.tsx`) — gradient "404", Make logo, back-to-home + Ask-KB CTAs. Replaces the default Next.js 404.

---

## [0.1.0] — 2026-05-24 — Tester beta

The first version we'd hand to someone outside the room. Working end-to-end
chat, browse, and adapt against a real Make.com org.

### Added

- **Ask KB** — streaming chat with `[N]` citation pills and source cards backed by hybrid retrieval (pgvector + Postgres FTS, weighted 0.7/0.3).
- **Browse** — search, four filter chip dropdowns (Team/App/Category/Complexity), match-score slider. URL-shareable state.
- **Scenario detail** — business purpose, data flow, branches, error handling, reuse notes, at-a-glance metadata, tags.
- **Adapt with AI** — Sonnet 4.5 generates a variant blueprint JSON plus a change summary and warnings. Downloadable, ready to import into Make.
- **Re-sync** — admin-only top-bar button with live NDJSON progress; folder/team/scenario-scoped via CLI flags on `pnpm ingest:backfill`.
- **Google OAuth** via Supabase Auth.
- **Auto-grant on first sign-in** — `AUTO_GRANT_DOMAINS` for catchall member access, `AUTO_GRANT_ADMIN_EMAILS` for cross-domain admin overrides.
- **Real Make names** — org/team/folder names pulled from the Make API, cached per ingest.
- **Hash dedup** — re-syncs skip unchanged scenarios; the LLM never re-runs on identical input unless `PROMPT_VERSION` bumps.
- 16 idempotent SQL migrations (HNSW vector index, FTS column, RLS on every table with 18 policies, the `search_scenarios` RPC, observability views, `llm_call_log`).

### Security hardening

- **Rate limits** per user on `/api/chat` (30/min), `/api/reuse` (5/min), `/api/search` (60/min).
- **Daily LLM budget enforcement** (`DAILY_LLM_BUDGET_USD`, `DAILY_EMBEDDING_BUDGET_USD`) — counts chat + reuse + ingestion together, 60s memo cache.
- **Prompt-injection sanitization** on retrieved scenario content before it's inlined into the chat system prompt.
- **Content-Security-Policy** plus HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **Private Storage bucket** for blueprints over 500KB.
- **Chat history retention** — pg_cron job deletes `chat_messages` older than 90 days nightly.
- All API routes validate cookie-auth (`getUser()`, not `getSession()`); service-role key never exposed to the browser bundle.

### Documented but deferred to a future release

- Pattern clustering (needs ≥100 ingested scenarios)
- Per-user Make.com tokens (currently a shared org token)
- Org-scoped `make_users` policy (currently visible to all authenticated)
- Direct import to Make from the Adapt panel (currently: download JSON)
- Conversation history sidebar
- Folder picker on the Re-sync UI button (CLI only)
- Nonce-based CSP (currently `'unsafe-inline'` required for Next.js hydration)

### Known compromises (intentional)

- Rate-limit state is in-memory per Vercel worker (fine for ≤10 concurrent users; swap to Redis when scaling).
- Auto-grant trusts the email domain blindly — depends on solid Google Workspace deprovisioning.

---

_Older entries will appear above this line as new versions ship._
