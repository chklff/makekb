# Archived planning docs

These were the original planning documents from April–May 2026, written **before** implementation started. They're kept here for archeology only — they contain decisions we later walked back from.

**For current state of the project, read the docs in the repo root:**

| Doc | Role |
|---|---|
| `/README.md` | How to install and run |
| `/PLAN.md` | Milestone roadmap |
| `/TASKS.md` | Daily kanban + build log |
| `/DECISIONS.md` | Locked architectural choices with rationale (source of truth on conflicts) |
| `/AGENTS.md` | Operating rules for AI engineers working on this repo |
| `/UI-Recommendations.md` | UX principles (still active, only color palette is overridden — see DECISIONS) |

---

## What's in this folder

### `Build-Brief.md`
The original 1600-line prescriptive technical brief. Specified everything from stack choices to file-by-file repo layout to milestone exit criteria. **Superseded by the combination of PLAN.md + TASKS.md + README.md.** The biggest divergence: it prescribed three Supabase Edge Functions (Deno) for the ingestion pipeline — we replaced that with plain Next.js API routes in May 2026 (see DECISIONS.md → "Walked back from Supabase Edge Functions").

### `AI-Architecture.md`
The original "why" document — architecture rationale, model choices, cost model, multi-model strategy, pattern library plan, evals strategy. **Most of the reasoning is still valid as background reading** (HNSW vs IVFFlat, hybrid retrieval, prompt design, hash dedup, cost analysis). The architecture diagrams and Edge Functions sections are outdated.

---

## When to read these

- You're doing project archeology — "why did they originally plan it this way?"
- You're considering a v1.5 feature mentioned in the original brief (pattern library, evals, reranker)
- You want context on a design decision that DECISIONS.md references only briefly

You should **not** read these to figure out how the system currently works. Use the root docs for that.
