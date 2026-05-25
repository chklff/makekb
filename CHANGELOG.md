# Changelog

All notable changes to Scenario KB are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project loosely follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
