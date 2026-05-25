# AGENTS.md — operating rules for AI engineers on this repo

This file is the AI-agent contract for the **Make Scenarios KB** project.
Read this **before** any session that touches code. It is the source of truth
for *how* to work; `PLAN.md` + `TASKS.md` cover *what* we're building and in what order.

---

## Project at a glance

- **What**: A semantic knowledge base over Make.com scenarios. Chat + browse + reuse.
- **Stack**: Next.js 15 App Router + Supabase (Postgres + pgvector + Auth + Edge Functions) + Anthropic (Sonnet/Haiku) + OpenAI embeddings.
- **Roadmap**: M1 ingestion → M2 auth+browse → M3 chat+reuse → M4 hardening. See `PLAN.md`.
- **Decisions log**: `DECISIONS.md`. Do not deviate without writing a new decision.

---

## Rule 1 — Plan, decide, build (in that order)

1. **Plan first.** Update `PLAN.md`/`TASKS.md`/`DECISIONS.md` before non-trivial work.
2. **Lock decisions in writing.** If a choice could be reconsidered later, write it
   into `DECISIONS.md` with the format in that file's template.
3. **Then build.** Code change must be traceable to a task in `TASKS.md`.

---

## Rule 2 — Every shipped chunk ends with a TEST PLAN

When a meaningful unit of work lands, the final message must include **two sections**:

### a) What I did
Short bullets — files / decisions / why. No code dumps.

### b) How to test (only what the **human** must check)

A short numbered list of things **I cannot verify on my own**. Each item:

```
N. <user action> → expected: <concrete outcome>
```

**Do on my own (don't put in the list):** `pnpm typecheck`, `pnpm build`, route
200s, lint, unit tests, schema validation, dev-server boots, env files exist.
If any of those fails I fix it before reporting — never make the user run them.

**Put in the list (the user's judgment is needed):**
- Visual / brand correctness ("does it look Make-branded?")
- UX flow decisions ("is this the right interaction?")
- Things tied to credentials / external services I can't see
- Acceptance against `PLAN.md` exit criteria

Keep it short. 3–6 steps usually. No filler.

Bad: ❌ "Open the browser dev tools and check for console errors" (I can check that).
Good: ✅ "Open `/chat` → expected: the source cards feel scannable in <3s and match scores read clearly."

---

## Rule 3 — Pause at agreed checkpoints

If the user said "build M1.1-M1.4 then pause," **stop after M1.4**. Do not
silently roll into M1.5. Show what shipped, give the test plan, wait.

---

## Rule 4 — Track tasks in the in-session task tool *and* `TASKS.md`

- Use TaskCreate / TaskUpdate during a session to track in-flight work.
- Mirror completed work into the `## ✅ Done` section of `TASKS.md` with a date.
- A task is **done** only when its acceptance criteria are observable (see Rule 2).

---

## Rule 5 — Read these before writing code

For any session, in this order:

1. `DECISIONS.md` — locked architectural choices (authoritative on conflicts)
2. `TASKS.md` — what's in flight + the build log
3. `PLAN.md` — milestone roadmap
4. `UI-Recommendations.md` — UX principles (color palette overridden per `DECISIONS.md`)
5. `README.md` — install + run instructions

The original planning docs (`docs/archive/Build-Brief.md`, `docs/archive/AI-Architecture.md`) are kept for archeology. Skip them unless you need historical context.

---

## Rule 6 — Visual identity

Use the **Make brand**, not the UI-Rec default "info blue." See `DECISIONS.md` →
"Visual identity" for the exact override table. Quick recipe:

- Page background: `bg-background` (sand `#F5F0E8`)
- Cards: `bg-card` (white) with `border-[hsl(var(--make-purple)/0.12)]`
- Primary CTAs: `<Button variant="gradient">` (purple→pink linear gradient)
- Citation pills: same gradient
- Reuse-notes warning: amber (unchanged for accessibility)
- Match scores ≥90%: green; 70-89%: amber; <70%: red
- Font: Inter (loaded via `next/font/google` in `app/layout.tsx`)

---

## Rule 7 — Security guardrails (non-negotiable)

- `SUPABASE_SERVICE_ROLE_KEY` only in server-side code. Files using it MUST start with `import 'server-only'`.
- RLS enabled on every public table.
- Every API route calls `await requireUser()` (which calls `supabase.auth.getUser()`) first.
- Admin-only routes (`/api/ingest/*`) additionally check `user_org_memberships.role IN ('owner','admin')`.
- Never commit `.env.local`. `.env.example` only contains placeholder values.

---

## Rule 8 — Cost guardrails

Every LLM call goes through `lib/llm/anthropic.ts` / `lib/llm/openai-embeddings.ts`
which check `DAILY_LLM_BUDGET_USD` against today's `ingestion_runs` totals before
firing. Bypassing this for "just one quick call" is forbidden.

---

## Rule 9 — Prompt version is a first-class API

The analysis prompt in `lib/llm/prompts/analysis-system.ts` is locked at
`PROMPT_VERSION=v1.0`. Any wording change requires:

1. Bump `PROMPT_VERSION` in `.env.example` (server-side only — used by ingest pipeline).
2. Run `pnpm evals:analysis` — must not regress.
3. Document in `DECISIONS.md`.
4. The next batch ingestion will re-analyze all rows whose `llm_prompt_version`
   doesn't match (hash-dedup is by-design defeated for prompt changes).

---

## Rule 10 — Release discipline

The app exposes its own version via the sidebar footer (`v0.1.0`) which links
to the in-app `/changelog` page that renders `CHANGELOG.md` from repo root.

On each meaningful release (user-visible behaviour change, new feature, security fix):

1. Bump `package.json` `version` (semver: patch for fixes, minor for features, major for breaking).
2. Add a new section at the **top** of `CHANGELOG.md` following the Keep-a-Changelog format:
   `## [x.y.z] — YYYY-MM-DD — short theme` with `### Added / Changed / Fixed / Security` sub-headers.
3. Commit. The sidebar pill + `/changelog` page auto-pick up the new version.
4. Tag the commit `git tag v0.1.1 && git push --tags` if you want it surfaced in GitHub Releases.

Don't bump the version for typo fixes, docs-only changes, or internal refactors that
no user can observe. Don't ship without a CHANGELOG entry once you have testers.

---

*End of agent rules. v1.1 (added Rule 10).*
