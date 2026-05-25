# PLAN.md — Make Scenarios KB
> North-star roadmap. Milestones, not Gantt charts.
> Sequencing of *what we build, in what order*. See `README.md` for install, `DECISIONS.md` for locked architectural choices.

---

## Vision
**Make Scenarios KB** helps Make.com power users stop rebuilding scenarios they already have. Ask "do we have something like X?" — get a grounded answer with clickable citations, one-click open in Make, or one-click "adapt this for Pipedrive instead." Backed by Claude Sonnet 4.5 analysis of every blueprint, pgvector hybrid search, RLS-scoped to the user's Make org.

**North Star Metric:** weekly active users who click **Reuse** or **Open in Make** from a citation (i.e. the KB actually saved them from rebuilding something).

**Out of scope for v1:** editing scenarios, mobile app, multi-tenant invites, public sharing, Slack bot.

---

## Reference docs
- `DECISIONS.md` — locked architectural choices (authoritative on conflicts)
- `TASKS.md` — daily kanban
- `AGENTS.md` — operating rules for AI engineers
- `UI-Recommendations.md` — UX principles (color palette overridden per `DECISIONS.md`)
- `README.md` — install + run
- `docs/archive/` — original Build-Brief + AI-Architecture (historical, see archive README)

---

## Phase 0 — Foundation ✅ (done before this plan)
- [x] Supabase project `ybabwpbxckqggjxnueeh` created with 5 reference tables + `make_scenarios` (43 cols) + pgvector
- [x] Prior Make.com scenario prototype validates the cleaner + Sonnet analysis end-to-end
- [x] Architecture, UI, and Build-Brief docs locked
- [x] Stack decisions made (`DECISIONS.md`)

---

## M1 — Ingestion working end-to-end ✅ DONE 2026-05-22
> *"One scenario goes in, complete analysed row + embedding comes out."*

- [x] Repo scaffolded (Next.js 15 + TS + Tailwind + shadcn + pnpm)
- [x] 11 SQL migrations applied to `ybabwpbxckqggjxnueeh` (HNSW, FTS, ingestion_runs, chat_history, patterns, user_org_memberships, RLS + 18 policies, anon-revoke, search RPC, observability views, service_role grants). *(pg_cron migration dropped — no Edge Functions to schedule.)*
- [x] `lib/make/clean-blueprint.ts` + 11 unit tests
- [x] `lib/llm/anthropic.ts` + `openai-embeddings.ts` + cost guardrail wrapper
- [x] `lib/ingest/run-scenario.ts` — single shared module callable from API routes + scripts
- [x] 4 ingest API routes (`scenario`, `batch`, `embed-backfill`, `manual`) — admin-gated
- [x] `scripts/backfill.ts` + `scripts/setup-db.ts` + `scripts/grant-user-org-access.ts` for fresh-install path
- [x] **5 real scenarios ingested end-to-end** (4594302, 91, 104, 85, 375789). All have embedding, analysis, hash, audit row.

**Architecture revision (2026-05-22):** Edge Functions dropped, ingestion is plain Next.js API routes. See DECISIONS.md "Walked back from Supabase Edge Functions to plain Next.js routes."

**Deferred from M1 (not blocking):**
- RLS verified with two test users from different orgs → folds into M2 (Auth)
- 20-scenario eval set with ≥90% match rate → v1.5 unless quality concern arises

---

## M2 — Auth + browse working 🔲
> *"A signed-in user can browse their org's scenarios with filters and drill into details."*
**Target: end of week 3 (2026-06-11)**

- [ ] Google OAuth working in production via Supabase Auth
- [ ] Middleware refreshes session + protects `(app)/*` routes
- [ ] `/browse` Server Component lists all scenarios in user's org with filter chips (Team, App, Trigger type, Complexity)
- [ ] Patterns/All segmented toggle (Patterns view shows empty state until v1.5)
- [ ] Stats tiles (Scenarios / Patterns / Apps / Teams) reflect filtered view
- [ ] `/scenarios/[id]` detail page with two-column layout, reuse-notes warning block, "Open in Make" + "Adapt this scenario" + "Download blueprint JSON" actions
- [ ] User without org membership sees a polite empty state with admin contact
- [ ] Make-branded design system applied (sand background, purple gradient CTAs, Inter typography)

**Exit criteria:** Two test users from different orgs sign in; each sees only their own org's scenarios. Browse loads in <1s for 500 rows. Filter combinations work.

---

## M3 — Chat + reuse working 🔲
> *"Ask a question, get a grounded answer with citations. Click reuse, get a Pipedrive variant."*
**Target: end of week 4 (2026-06-18)**

- [ ] `/api/chat` streams Anthropic Haiku responses with citation pills (`[1]`, `[2]`)
- [ ] Query understanding extracts filters (apps, categories) before retrieval
- [ ] Hybrid search via `search_scenarios` RPC: vector + FTS + JSONB filters, RLS-enforced
- [ ] `/chat` UI renders streamed text, inline citations, source cards (with match score %), suggested follow-ups
- [ ] `/api/reuse` calls Sonnet 4.5 with source blueprint + modification request, returns `{ new_blueprint, change_summary, warnings }`
- [ ] "Adapt with AI" panel on detail page wired to `/api/reuse`
- [ ] "Generated variant review" page shows change summary, warnings, side-by-side diff, download/import-to-Make actions
- [ ] Retrieval eval recall@5 ≥ 0.9 on 30-query golden set
- [ ] Per-user rate limit (30 req/min) on `/api/chat` and `/api/reuse`

**Exit criteria:** A real user asks "do we have a HubSpot → Facebook CAPI scenario?" → gets a streaming answer with 2 cited matches → clicks Reuse → fills in "swap HubSpot for Pipedrive" → gets a downloadable blueprint JSON.

---

## M4 — Production hardening 🔲
> *"Ship-ready: secure, observable, documented."*
**Target: end of week 5 (2026-06-25)**

- [ ] All security checklist items verified (Build-Brief §16)
- [ ] Sentry capturing errors from API routes + Edge Functions
- [ ] Daily Slack summary cron with ingestion + chat + cost numbers
- [ ] `README.md` covers local setup, evals, deploys
- [ ] One operator runbook entry per `ingestion_runs.status` failure code
- [ ] Load test: 100 concurrent chat requests, p95 latency < 4s
- [ ] CI: lint + typecheck + test + analysis evals on PRs touching prompts

**Exit criteria:** A new engineer can clone the repo, follow README, get a local dev environment running, and ship a fix to production in under an hour.

---

## Stretch — v1.5 🔲
> *"Once we have data + users, expand."*
**Target: 2026-07+**

- [ ] Pattern library cron enabled — clusters all scenarios nightly
- [ ] Reranker integration (Cohere `rerank-v3` or self-hosted BGE)
- [ ] Multi-tenant invite flow (admin invites teammates by email)
- [ ] Scenario versioning / blueprint diff viewer
- [ ] Slack bot — same chat experience inside Slack
- [ ] Direct import to Make via API (currently download-only)
- [ ] Drift detection: alert when `make_updated_at > reanalyzed_at` for >24h
- [ ] **SEC-H2 — Per-user Make tokens** (replace shared `MAKE_API_TOKEN`). Today the token reads the whole org regardless of who's signed in. See DECISIONS.md "Accepted security risks for v1."
- [ ] **SEC-H4 — Tighter auto-grant** (`AUTO_GRANT_ALLOWED_EMAILS` explicit allowlist, or cross-check against `make_users`). Today we trust the Google Workspace domain blindly. See DECISIONS.md.
- [ ] **Per-user roles / permissions** — currently `member` and `admin` are the only roles; both see all org scenarios. Future: scenario-level or team-level scoping inside the KB.
- [ ] Signed-URL download endpoint for >500KB blueprints offloaded to Storage (bucket is private; today the Adapt panel errors out with `blueprint_in_storage`)

---

## 🚦 Constraints
- **Solo engineer + Claude Code** doing the build.
- **Budget:** ~$66/month all-in for a 500-scenario org (see `docs/archive/AI-Architecture.md` §9.6). Daily LLM budget cap: $20.
- **Hard rule:** don't start M(n+1) until M(n) exit criteria are met. Verify between milestones.
- **Hard rule:** do not deviate from `DECISIONS.md` without writing a new decision.

---

## 💡 Parking lot (don't build yet)
- [ ] Mobile-first design — desktop is enough for v1
- [ ] i18n
- [ ] Self-serve Make API token rotation (per-user OAuth to Make)
- [ ] Public link / share a scenario summary externally
- [ ] Admin panel UI (Supabase dashboard works for v1)
- [ ] Embedded "ask the KB" widget for other tools
