# Make Scenarios Knowledge Base — AI Architecture

> 📜 **ARCHIVED — May 2026.** This was the original "why" doc — architecture rationale, model choices, cost model, pattern library plan. The Edge Functions sections (§2, §5, §10) describe an approach we walked back from. The reasoning sections (data model, retrieval strategy, prompts, cost model) are still useful as background. Current state lives in the project root. See `/docs/archive/README.md`.

**Document type:** Architecture & engineering spec
**Audience:** CTO / dev team
**Status:** v1.0 — ready to build against (with the deviations noted above)
**Backing project:** Supabase `ybabwpbxckqggjxnueeh` (Make KB)

---

## 1. Executive Summary

### 1.1 What we are building

A semantic knowledge base over an organization's full Make.com scenario inventory. The system ingests scenario blueprints (the raw JSON exported by Make's API), uses an LLM to *understand* each scenario as a business process, stores that understanding in Postgres with vector embeddings, and exposes a chat + search layer so any team member can ask:

- *"Do we already have a scenario that syncs HubSpot deals to Facebook CAPI?"*
- *"Show me all polling triggers on Salesforce."*
- *"What's our cheapest existing template for routing form submissions into a CRM?"*
- *"Reuse this scenario but swap Slack for Teams."*

The output is a recommendation, a ready-to-clone blueprint, or a structured comparison of existing patterns. The goal is **stop rebuilding the same scenarios from scratch** in accounts that have hundreds of them across many teams and folders.

### 1.2 Core architectural thesis

The entire system rests on one principle:

> **The LLM is the reader, the database is the librarian, the vector is the index card.**

We do not parse Make blueprints into modules and try to compare them structurally — modules are not interchangeable, routers and filters carry meaning that lives in mapper expressions, and the *same business intent* can be implemented with very different module graphs. Instead, we send the cleaned blueprint to a strong LLM, get back a structured business-language description, and let semantic search over that description do the work.

Three storage formats coexist in one Postgres row:

| Format | Purpose | Queried by |
| --- | --- | --- |
| **JSONB blueprint** | Source of truth for export/reuse | Direct lookup, never searched semantically |
| **Structured columns** (tags, apps, trigger_type, ...) | Exact filtering | SQL `WHERE` / `GIN` indexes |
| **Vector embedding** of the LLM description | Meaning-based discovery | pgvector cosine similarity |

This hybrid is non-negotiable — vectors alone cannot answer "scenarios in folder X owned by team Y", and SQL alone cannot answer "find something *similar* to this idea".

### 1.3 What is already built (current state of `ybabwpbxckqggjxnueeh`)

Verified directly against the Supabase project as of writing:

- ✅ **5 tables exist:** `make_organizations`, `make_teams`, `make_folders`, `make_users`, `make_scenarios`
- ✅ **`make_scenarios` has all 43 columns** the architecture calls for (org/team/folder/user denormalized refs, LLM analysis fields, JSONB array columns, vector(1536) embedding, blueprint storage fields, timestamps)
- ✅ **Extensions enabled:** `vector` 0.8.0, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`
- ✅ **Indexes present:** primary key, unique on `make_scenario_id`, btree on team/folder/trigger_app/complexity, GIN on `apps_involved` and `tags`, **`ivfflat`** on `embedding`
- ✅ **JSONB migration done** — `apps_involved`, `tags`, `use_cases`, `branches_summary` are all `JSONB` (correctly fixed from the original `TEXT[]`)
- ⚠️ **0 rows ingested yet** — clean slate for the production ingestion pipeline
- ⚠️ **Embedding index is `ivfflat`** — should be **migrated to `hnsw`** (see §6.2)
- ⚠️ **RLS likely disabled** for ingestion convenience — need a proper service-role policy before exposing any read endpoint (see §10)
- ❌ **No ingestion pipeline running yet** — only Make-side prototype work
- ❌ **No query/chat layer built**
- ❌ **No re-analysis / drift detection**

This document is the spec to take it from prototype to production.

### 1.4 What changes vs the previous design

The previous design (preserved in the source findings document) is **structurally correct and we are building on it**. This architecture adds:

1. A **multi-model strategy** with explicit price/quality tiers, and routing rules for when to use each.
2. An **HNSW index** instead of IVFFlat, plus a `vector(1024)` option for Voyage / smaller models.
3. **Deduplication via `blueprint_hash`** — skip re-analysis when nothing changed. This was mentioned in the prior schema but never wired into the ingestion logic.
4. A **batch ingestion path** (Edge Function + queue) alongside the per-scenario Make pipeline, because crawling 500+ scenarios via a Make scenario hits rate limits and is fragile.
5. **A dedicated query/chat layer** — Edge Function that does query rewriting, hybrid search, reranking, and grounded generation. This was not designed before.
6. **A pattern library** — a second-order abstraction that clusters scenarios into reusable templates.
7. **Evals** — a small golden set of scenarios with known-correct analyses, run on every prompt change.
8. **Security model** — proper RLS policies and key separation, not "disable RLS and hope".
9. **Observability** — what to log, what to alert on, what dashboards matter.

---

## 2. System Architecture (High Level)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              MAKE.COM ACCOUNT                                    │
│         Orgs ─► Teams ─► Folders ─► Scenarios (the blueprints we want)          │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │ Make API: /scenarios, /scenarios/:id/blueprint
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          INGESTION LAYER                                          │
│                                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────────────────────┐      │
│  │  Mode A: Make.com    │         │  Mode B: Batch crawler (Edge Fn)     │      │
│  │  scenario (per item, │         │  Walk all teams → folders →          │      │
│  │  webhook/manual)     │         │  scenarios, queue per scenario       │      │
│  └──────────┬───────────┘         └─────────────────┬────────────────────┘      │
│             │                                       │                            │
│             └───────────────────┬───────────────────┘                            │
│                                 ▼                                                 │
│                  ┌──────────────────────────────┐                                │
│                  │  1. Hash check (skip if      │                                │
│                  │     blueprint_hash matches)  │                                │
│                  └──────────────┬───────────────┘                                │
│                                 ▼                                                 │
│                  ┌──────────────────────────────┐                                │
│                  │  2. Surgical cleaner         │                                │
│                  │     (strip designer/         │                                │
│                  │     parameters, keep         │                                │
│                  │     restore + mapper +       │                                │
│                  │     filter + routes)         │                                │
│                  └──────────────┬───────────────┘                                │
│                                 ▼                                                 │
│                  ┌──────────────────────────────┐                                │
│                  │  3. LLM analyzer             │                                │
│                  │     (Claude Sonnet 4.5,      │                                │
│                  │     structured output,       │                                │
│                  │     temp=0)                  │                                │
│                  └──────────────┬───────────────┘                                │
│                                 ▼                                                 │
│                  ┌──────────────────────────────┐                                │
│                  │  4. Embedding generator      │                                │
│                  │     (text-embedding-3-small  │                                │
│                  │     on concatenated          │                                │
│                  │     analysis text)           │                                │
│                  └──────────────┬───────────────┘                                │
│                                 ▼                                                 │
│                  ┌──────────────────────────────┐                                │
│                  │  5. Upsert into Supabase     │                                │
│                  │     (raw + clean + analysis  │                                │
│                  │     + vector + relations)    │                                │
│                  └──────────────┬───────────────┘                                │
└─────────────────────────────────┼────────────────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            STORAGE LAYER                                          │
│                                                                                   │
│  Postgres (Supabase)                          Supabase Storage                   │
│  ┌────────────────────┐                       ┌────────────────────┐            │
│  │ make_organizations │                       │  blueprints/       │            │
│  │ make_teams         │                       │    {scenario_id}/  │            │
│  │ make_folders       │   ─── url ref ──►     │      v{n}.json     │            │
│  │ make_users         │                       │      (>500KB)      │            │
│  │ make_scenarios ◄───┼─── vector index       └────────────────────┘            │
│  │   (43 cols + vec)  │                                                          │
│  │ scenario_patterns  │   ◄── §11 clustering layer                              │
│  │ ingestion_runs     │   ◄── audit / observability                             │
│  └────────────────────┘                                                          │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       QUERY & CHAT LAYER (Edge Functions)                        │
│                                                                                   │
│  /search       hybrid: vector + JSONB filters + reranker                         │
│  /chat         multi-turn RAG over scenarios, returns grounded answer            │
│  /reuse        given a scenario_id, generate variant blueprint with diff         │
│  /patterns     browse the clustered template library                             │
│                                                                                   │
│  Model routing:                                                                  │
│    ingestion analysis   → Claude Sonnet 4.5    (quality-critical, expensive)     │
│    user chat / search   → Claude Haiku 4.5     (cheap, fast, good enough)        │
│    reuse generation     → Claude Sonnet 4.5    (must not hallucinate JSON)       │
│    embeddings           → OpenAI text-embedding-3-small  (1536 dims, $0.02/M)   │
│    reranking            → Cohere rerank-v3 or BAAI/bge-reranker (optional)      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Stack summary

| Layer | Choice | Why |
| --- | --- | --- |
| Database | Postgres (Supabase) | Single home for relational + JSONB + vector |
| Vector index | pgvector + **HNSW** | Best recall/latency for our scale (5k–50k scenarios) |
| Blob storage | Supabase Storage | Raw blueprints over 500KB don't belong in DB rows |
| Compute (ingestion) | Supabase Edge Functions (Deno) | Same project, fast, no extra infra |
| Compute (chat API) | Supabase Edge Functions | Co-located with the DB, low latency |
| Orchestration option A | Make.com scenario | For incremental / event-driven ingestion |
| Orchestration option B | Edge Function + pg cron | For batch backfill and scheduled re-sync |
| LLM (ingestion) | Anthropic Claude Sonnet 4.5 | Best structured output, handles 100KB+ JSON well |
| LLM (chat/search) | Anthropic Claude Haiku 4.5 | 10× cheaper, fast, good enough for retrieval-grounded answers |
| Embeddings | OpenAI text-embedding-3-small (1536) | Cheapest credible option, 5× cheaper than large, quality plateau is fine here |
| Frontend | Next.js (later) or just Slack bot (now) | Start with chat-in-Slack, build a UI when patterns settle |

---

## 3. Data Model

### 3.1 Reference tables (already exist)

These mirror the Make.com hierarchy and exist as foreign-key targets so we can ask "all scenarios in folder X" without scanning JSON.

```sql
make_organizations (id, make_org_id UNIQUE, org_name)
make_teams         (id, make_team_id UNIQUE, org_id, team_name)
make_folders       (id, make_folder_id UNIQUE, team_id, folder_name)
make_users         (id, make_user_id UNIQUE, user_name, email)
```

These tables are **populated during ingestion** — when we see a new team/folder/user ID we insert it. No separate sync job needed for v1.

### 3.2 Core table — `make_scenarios`

The 43 columns already in the DB are correct. Grouped by purpose:

**Identity & relations** (denormalized for fast joins/filters without lookups):

```
id                  uuid PK
make_scenario_id    text UNIQUE NOT NULL
scenario_name       text NOT NULL

org_id              uuid → make_organizations
make_org_id         text          -- denormalized
org_name            text          -- denormalized

team_id             uuid → make_teams
make_team_id        text
team_name           text

folder_id           uuid → make_folders
make_folder_id      text
folder_name         text

created_by_user_id  uuid → make_users
make_created_by_id  text
created_by_name     text
```

**LLM-generated understanding** (this is the product):

```
one_line_summary    text   -- "When X happens in Y, do Z" (≤20 words)
business_purpose    text   -- 2-3 sentence business framing
full_description    text   -- Full narrative, every branch, every error path
data_flow           text   -- Step-by-step plain English with arrows
branches_summary    jsonb  -- [{condition, path_true, path_false}, ...]
error_handling      text   -- Every onerror handler described
reuse_notes         text   -- What must change to reuse (connections, hardcoded IDs, mappings)
```

**LLM-extracted structured tags** (for fast filtering and faceting):

```
apps_involved   jsonb   -- ["hubspotcrm", "facebook-conversion-leads"]
tags            jsonb   -- ["hubspot", "facebook-capi", "deals", ...]
use_cases       jsonb   -- ["Ad attribution", "CRM sync", ...]
category        text    -- "Ad Tracking" | "CRM Sync" | "Lead Mgmt" | ...
trigger_type    text    -- "polling" | "webhook" | "instant" | "scheduled"
trigger_app     text    -- "hubspotcrm"
trigger_event   text    -- "Deal Updated"
complexity      text    -- "simple" | "medium" | "complex"
```

**Blueprint storage**:

```
blueprint_json         jsonb   -- Raw blueprint as received (untouched)
blueprint_clean_json   jsonb   -- Cleaned version sent to the LLM (debug/repro)
blueprint_storage_url  text    -- If >500KB, path in Supabase Storage; jsonb cols stay NULL
blueprint_hash         text    -- SHA-256 of raw blueprint, used to skip re-analysis
```

**LLM audit**:

```
llm_analysis_json   jsonb         -- Raw LLM JSON output as-is (full audit trail)
llm_model_used      text          -- "claude-sonnet-4-5-20250929"
llm_prompt_version  text          -- "v1.2" — bump every prompt change
analyzed_at         timestamptz
```

**Vector**:

```
embedding   vector(1536)   -- OpenAI text-embedding-3-small
```

**Timestamps**:

```
make_created_at  timestamptz   -- From Make API (.created)
make_updated_at  timestamptz   -- From Make API (.last_edit)
imported_at      timestamptz DEFAULT now()
reanalyzed_at    timestamptz   -- Last time LLM re-ran on this row
```

### 3.3 Why hash deduplication matters

A 500-scenario account, re-analyzed monthly, at Sonnet pricing is real money (see §9). The `blueprint_hash` column is the lever that makes this cheap:

```
on ingestion:
  raw_blueprint = fetch_from_make(scenario_id)
  new_hash = sha256(canonical_json(raw_blueprint))
  existing = SELECT blueprint_hash, llm_prompt_version
             FROM make_scenarios WHERE make_scenario_id = ?
  if existing and existing.blueprint_hash == new_hash
     and existing.llm_prompt_version == CURRENT_PROMPT_VERSION:
       skip   -- nothing changed, nothing to do
  else:
       run full pipeline, upsert with new hash
```

Re-analysis is forced when *either* the blueprint changed *or* we bumped the prompt version. The prompt-version gate is what lets us improve the prompt and have everything re-analyze on the next nightly run — without it, schema drift would silently accumulate.

### 3.4 New tables to add

#### `ingestion_runs` (observability)

Every ingestion attempt logged, success or failure. Without this we cannot debug pipeline issues at scale.

```sql
CREATE TABLE ingestion_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id       text NOT NULL,        -- make_scenario_id
  trigger           text NOT NULL,        -- 'manual' | 'batch' | 'webhook' | 'recurring'
  status            text NOT NULL,        -- 'success' | 'skipped_hash_match' | 'failed_fetch' | 'failed_llm' | 'failed_embed' | 'failed_insert'
  blueprint_hash    text,
  llm_model_used    text,
  llm_prompt_version text,
  llm_tokens_in     int,
  llm_tokens_out    int,
  llm_cost_usd      numeric(10,4),
  embedding_tokens  int,
  embedding_cost_usd numeric(10,4),
  duration_ms       int,
  error_message     text,
  error_stack       text,
  started_at        timestamptz DEFAULT now(),
  finished_at       timestamptz
);

CREATE INDEX ON ingestion_runs (scenario_id, started_at DESC);
CREATE INDEX ON ingestion_runs (status, started_at DESC);
```

#### `scenario_patterns` (the template library — §11)

```sql
CREATE TABLE scenario_patterns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name    text NOT NULL,            -- "CRM Deal → Ad Platform Conversion Event"
  pattern_summary text NOT NULL,
  category        text,
  apps_in_pattern jsonb,                    -- ["{crm}", "{ad_platform}"] — abstract
  member_scenario_ids uuid[],               -- which concrete scenarios are in this cluster
  representative_scenario_id uuid REFERENCES make_scenarios(id),
  embedding       vector(1536),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX ON scenario_patterns USING hnsw (embedding vector_cosine_ops);
```

---

## 4. The Cornerstone: Blueprint → Understanding

This is the single highest-leverage component in the whole system. Quality here determines quality everywhere downstream — search relevance, chat answers, reuse suggestions all depend on the LLM correctly understanding what each scenario does.

### 4.1 Stage 1 — Surgical cleaning

Make blueprints have three kinds of metadata per module. Treat them differently:

| `metadata.*` field | Content | Action |
| --- | --- | --- |
| `designer` | x/y canvas coordinates | **Strip** — pure layout, zero logic |
| `parameters` | Full list of all possible enum options the module *could* accept (e.g. 200+ HubSpot field names) | **Strip** — this is what bloats blueprints to MB scale, and it's noise — the LLM does not need the dropdown options, only the *selected* values |
| `restore` | Human-readable labels of what *was actually selected* (`"label": "Deals"`, `"watchPattern": {"label": "Updated"}`) | **Keep** — this is the disambiguator that lets the LLM read configured intent |

Also strip top-level `metadata.designer.orphans` and other UI-only fields. **Keep** `metadata.scenario` (sequential, maxErrors, dlq, etc — these are operational behaviors).

**Always keep, no exceptions:**

- `flow[].mapper` — the data-mapping expressions are the *core* logic
- `flow[].filter` — router/filter conditions are *the* business logic
- `flow[].routes[].flow` — recursively, every branch of every router
- `flow[].onerror[]` — error paths matter, recursively cleaned the same way
- `flow[].module`, `flow[].version`, `flow[].parameters` (the *configured* parameters, not the metadata enum list)

Reference implementation lives in the Make Code module already prototyped (see source findings). The Edge Function version is identical logic in TypeScript:

```ts
function cleanModule(mod: any): any {
  const cleaned: any = {
    id: mod.id,
    module: mod.module,
    version: mod.version,
    parameters: mod.parameters,
    mapper: mod.mapper,
  };
  if (mod.filter) cleaned.filter = mod.filter;
  if (mod.metadata?.restore && Object.keys(mod.metadata.restore).length > 0) {
    cleaned.metadata = { restore: mod.metadata.restore };
  }
  if (Array.isArray(mod.onerror)) cleaned.onerror = mod.onerror.map(cleanModule);
  if (Array.isArray(mod.routes)) {
    cleaned.routes = mod.routes.map((r: any) => ({
      ...r,
      flow: Array.isArray(r.flow) ? r.flow.map(cleanModule) : [],
    }));
  }
  return cleaned;
}
```

A 100KB HubSpot blueprint becomes ~8–12KB after this, a 90% reduction. A 5MB monster usually drops to under 300KB — comfortably fits in a single LLM call.

### 4.2 Stage 2 — The analysis prompt

This is the highest-value asset in the codebase. Version it, eval it, never tweak it without re-running the golden set.

**System prompt** (stable, rarely changes):

```
You are an expert Make.com automation architect.
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
- For trigger_app, use the app key of the FIRST module in flow only.
```

**Response schema** — passed as structured output (Anthropic tool-use or OpenAI `response_format: json_schema`). Descriptions on the *tricky* fields only, never on obvious ones, because LLMs over-anchor on schema descriptions:

```json
{
  "type": "object",
  "properties": {
    "one_line_summary": { "type": "string" },
    "business_purpose": { "type": "string" },
    "full_description": { "type": "string" },
    "data_flow":        { "type": "string" },
    "branches": {
      "type": "array",
      "description": "Every router or filter condition. Empty array [] if none.",
      "items": {
        "type": "object",
        "properties": {
          "condition":  { "type": "string" },
          "path_true":  { "type": "string" },
          "path_false": { "type": "string" }
        },
        "required": ["condition", "path_true", "path_false"]
      }
    },
    "error_handling": {
      "type": "string",
      "description": "Every onerror handler: which module, type (Resume/Rollback/Ignore/Commit/Break), and impact. 'No error handlers configured' if none."
    },
    "apps_involved": {
      "type": "array",
      "description": "App keys only, extracted before the colon. Exclude 'builtin'. No duplicates.",
      "items": { "type": "string" }
    },
    "use_cases":  { "type": "array", "items": { "type": "string" }, "description": "2-4 short business use case labels." },
    "tags":       { "type": "array", "items": { "type": "string" }, "description": "5-8 lowercase search tags. Include app names, object types, actions." },
    "category":   { "type": "string", "description": "Pick one: Ad Tracking / CRM Sync / Lead Management / Notifications / E-commerce / Data Enrichment / Ops / Reporting / Internal Tools / Customer Success." },
    "trigger_type": {
      "type": "string",
      "enum": ["polling", "webhook", "instant", "scheduled"],
      "description": "polling = scheduled poll for new/updated records. webhook = external push. instant = Make-native instant trigger. scheduled = pure time-based, no data source."
    },
    "trigger_app":   { "type": "string", "description": "App key of the FIRST module only." },
    "trigger_event": { "type": "string", "description": "Human-readable event name, e.g. 'Deal Updated'." },
    "complexity": {
      "type": "string",
      "enum": ["simple", "medium", "complex"],
      "description": "simple = linear, 1-3 modules. medium = 4-8 modules or some branching. complex = 9+ modules or multiple routers/error paths."
    },
    "reuse_notes": {
      "type": "string",
      "description": "Concrete and specific: which connections need replacing, which IDs are hardcoded, which mappings are account-specific. No generic advice."
    }
  },
  "required": [
    "one_line_summary","business_purpose","full_description","data_flow",
    "branches","error_handling","apps_involved","use_cases","tags",
    "category","trigger_type","trigger_app","trigger_event","complexity","reuse_notes"
  ]
}
```

**User message:**

```
Analyze this Make.com scenario blueprint and return the structured JSON.

Scenario name: {{scenario_name}}
Folder: {{folder_name}}  (optional context)
Team:   {{team_name}}    (optional context)

BLUEPRINT:
{{cleaned_blueprint_json}}
```

**Model settings:**

| Setting | Value |
| --- | --- |
| Model | `claude-sonnet-4-5` |
| Temperature | `0` |
| Max output tokens | `2000` |
| Tool / response format | Structured output / forced tool call |

### 4.3 Stage 3 — Build the embedding input

Embed *meaning*, not JSON. Concatenate the human-readable fields into one rich passage:

```
{one_line_summary}. {business_purpose} {full_description} {data_flow}
Apps: {apps_involved}. Tags: {tags}. Use cases: {use_cases}.
Category: {category}. Trigger: {trigger_event} via {trigger_app} ({trigger_type}).
```

Embed that string with `text-embedding-3-small`. The vector goes into the `embedding` column.

### 4.4 Stage 4 — Upsert

One transaction writes:

- raw `blueprint_json` (or `blueprint_storage_url` if >500KB, then null the JSONB)
- `blueprint_clean_json`
- `blueprint_hash` (SHA-256 of canonical raw)
- all LLM-derived fields
- `llm_analysis_json` (full raw response, never lose this)
- `llm_model_used`, `llm_prompt_version`, `analyzed_at`
- `embedding`
- relational refs (org/team/folder/user) — upsert into reference tables first
- timestamps

Use **`ON CONFLICT (make_scenario_id) DO UPDATE`** — never duplicate rows. The conflict target is `make_scenario_id` because that's the unique business key from Make.

---

## 5. Ingestion Pipeline

### 5.1 Two modes, same core

The cleaning → LLM → embed → upsert core is identical. Only the orchestration differs.

**Mode A — Make.com scenario (incremental, event-driven)**

Best for: ongoing keep-fresh sync, manual re-analysis of a specific scenario, demoing the system end-to-end without writing code. This is what the prior work has prototyped.

```
Webhook / Manual trigger
  → Make: Get scenario blueprint (Make API)
  → Code module: surgical cleaner
  → AI Agent / HTTP Anthropic: analyze blueprint (structured output)
  → Code module: build embedding_input + stringify arrays
  → HTTP OpenAI: create embedding
  → Supabase HTTP: upsert row (NOT the native Supabase module — see §5.4)
```

**Mode B — Edge Function batch crawler (bulk, scheduled)**

Best for: initial backfill of an account with 500 scenarios, nightly re-sync, re-analysis after a prompt version bump. Make scenarios are not the right tool for crawling hundreds of items with rate limits and retries.

```
Edge Function `ingest-batch` (triggered by pg_cron or manual POST)
  for each org → team → folder → scenario in Make:
    fetch blueprint → hash → skip-if-unchanged check
    enqueue work item into pg table `ingestion_queue`

Edge Function `ingest-worker` (concurrent invocations, polls queue)
  pop item → clean → LLM → embed → upsert → log run
```

Use Supabase's [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) to run the crawler nightly. Workers are short-lived stateless functions, processing one scenario each, max ~10 concurrent to avoid hitting Anthropic and Make rate limits.

### 5.2 Recommended split

- **Use Mode A** for the live demo and for incremental updates triggered by user action ("re-analyze this one scenario").
- **Build Mode B** as the backbone of the system. Backfill the entire account once, then keep it fresh on a schedule. Mode A becomes the human-in-the-loop override.

### 5.3 Rate limits & concurrency

| Service | Limit (typical) | Strategy |
| --- | --- | --- |
| Make API | ~1000 req/min/org | Single-threaded crawl is fine; bottleneck is downstream LLM |
| Anthropic Claude (Tier 2) | ~50 req/min, ~40K input TPM | Cap worker concurrency at 5–8; exponential backoff on 429 |
| OpenAI embeddings | 3000 RPM tier 1+ | Never a bottleneck |
| Supabase Postgres | Connection pool | Use the pooler URL for Edge Functions |

A 500-scenario backfill at 5 concurrent workers, ~6s per scenario, finishes in ~10 minutes. Plan for and budget accordingly.

### 5.4 Important: array fields and the Supabase insert

This bit the previous build and is worth calling out clearly. The columns `apps_involved`, `tags`, `use_cases`, `branches_summary` are **`jsonb`** in our schema. When inserting from Make's native Supabase module:

- Make's native module does **not** handle JSONB well — it sends arrays as text and rejects nested objects.
- Solution: in the Code module *before* the Supabase insert, do `JSON.stringify(array)` for each of those four fields. Map the stringified strings into the Supabase module's text-looking fields. Postgres auto-casts JSON text into `jsonb` on insert.
- Or — preferred — switch to the HTTP module and POST raw JSON to `https://{project}.supabase.co/rest/v1/make_scenarios` with the service-role key in headers. Cleaner, lets you handle conflicts (`Prefer: resolution=merge-duplicates`).

In the Edge Function path this is a non-issue — the JS Postgres client handles JSONB natively.

### 5.5 Failure handling

Every step can fail. Log everything to `ingestion_runs`. Specific behaviors:

| Failure | Action |
| --- | --- |
| Make API 5xx | Retry 3× with exponential backoff. After: log `failed_fetch`, alert. |
| Make API 401/403 | Log, alert immediately — token rotation needed. |
| Cleaner exception | Log raw blueprint to Storage, mark `failed_clean`. Almost never happens. |
| LLM 429 / overloaded | Backoff and retry up to 3×. |
| LLM returns invalid JSON despite structured output | Retry once with temperature 0.1 and a "your last output failed validation, return ONLY JSON" nudge. If still bad: log `failed_llm`, alert. |
| LLM returns valid JSON but a required field is null/empty | Same as above — retry once, then alert. Do not silently insert a bad row. |
| Embedding API failure | Retry 3×. If still bad: insert the row *without* embedding and queue a separate `embedding-backfill` job. |
| Supabase insert conflict | Already handled by `ON CONFLICT DO UPDATE`. |

---

## 6. Storage & Indexing Decisions

### 6.1 When to put blueprints in Storage vs JSONB

Threshold: 500KB (after stringification, before any storage).

| Raw size | `blueprint_json` | `blueprint_storage_url` |
| --- | --- | --- |
| < 500KB | full JSONB | NULL |
| ≥ 500KB | NULL | `blueprints/{make_scenario_id}/{blueprint_hash}.json` |

Why: JSONB rows over ~1MB hurt every query that touches the table — Postgres has to TOAST them, sequential scans become brutal, replication slows. 500KB is the safe knee. The `blueprint_hash` in the path lets us version blueprints without overwriting history.

The cleaned version (`blueprint_clean_json`) is almost always under 100KB and stays in JSONB for fast inspection.

### 6.2 Vector index: switch IVFFlat → HNSW

The DB currently has:

```sql
CREATE INDEX make_scenarios_embedding_idx
  ON make_scenarios USING ivfflat (embedding vector_cosine_ops);
```

**This should be HNSW** for our scale (5k–50k rows, growing). Reasons:

- **No training step** — IVFFlat needs `lists` tuned to row count, recall degrades as the table grows past the trained size. HNSW is self-organizing.
- **Better recall at small k** — typical top-5 / top-10 queries are exactly HNSW's sweet spot.
- **No re-indexing every load** — IVFFlat needs periodic rebuilds; HNSW handles inserts gracefully.
- **Memory overhead is fine at our scale** — at 50k rows × 1536 dims × HNSW overhead, we're well under a gigabyte.

**Migration:**

```sql
-- Build the new index alongside, then swap.
CREATE INDEX CONCURRENTLY make_scenarios_embedding_hnsw_idx
  ON make_scenarios
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DROP INDEX IF EXISTS make_scenarios_embedding_idx;
ALTER INDEX make_scenarios_embedding_hnsw_idx RENAME TO make_scenarios_embedding_idx;
```

Defaults (`m=16`, `ef_construction=64`) are good for our size; tune only if recall measured against the golden set drops below 0.95.

At query time, set `hnsw.ef_search` higher for better recall:

```sql
SET LOCAL hnsw.ef_search = 100;   -- higher = better recall, slightly slower
```

### 6.3 GIN indexes for JSONB filtering

Already created on `apps_involved` and `tags`. **Add** them on `use_cases`:

```sql
CREATE INDEX make_scenarios_use_cases_idx
  ON make_scenarios USING gin (use_cases);
```

This makes `WHERE use_cases @> '["CRM sync"]'` index-backed.

### 6.4 Full-text search column (optional, recommended)

Vector is great for semantic recall but bad at exact terms like specific app names, scenario IDs, or proper nouns. Add a `tsvector` generated column for hybrid search:

```sql
ALTER TABLE make_scenarios
  ADD COLUMN search_text tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(scenario_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(one_line_summary, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(business_purpose, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(full_description, '')), 'C')
  ) STORED;

CREATE INDEX make_scenarios_fts_idx
  ON make_scenarios USING gin (search_text);
```

Hybrid retrieval (vector + FTS) consistently beats either alone. See §7.2.

---

## 7. Query & Chat Layer

### 7.1 Endpoints

Three Edge Functions cover the user-facing surface:

| Endpoint | Purpose | Returns |
| --- | --- | --- |
| `POST /search` | Hybrid retrieval, structured | `[{ scenario_id, name, one_line_summary, score, ... }]` |
| `POST /chat` | Conversational RAG over scenarios | Streaming text answer with citations |
| `POST /reuse` | Given source scenario + user goal, produce variant blueprint + diff | `{ blueprint, change_summary }` |

### 7.2 Hybrid retrieval — the search pipeline

User query: `"do we have a scenario that syncs HubSpot deals to Facebook ads?"`

```
1. Query understanding (cheap LLM call, optional)
   Claude Haiku → extract structured filters from the query:
     {
       "free_text": "syncs HubSpot deals to Facebook ads",
       "filters": { "apps_involved": ["hubspotcrm", "facebook"] }
     }
   Used to narrow the candidate set with SQL before vector search.

2. Candidate fetch (SQL pre-filter):
   SELECT id, embedding, search_text, ...
   FROM make_scenarios
   WHERE (filters.apps_involved IS NULL OR apps_involved ?| filters.apps_involved)
     AND (filters.team_id IS NULL OR team_id = ?)
     AND ...
   -- typically narrows from 5000 to 50-200 candidates

3. Embed the free_text portion:
   query_vec = openai.embed(filters.free_text)

4. Vector + FTS scoring on candidates:
   SELECT id,
          1 - (embedding <=> :query_vec) AS vector_score,
          ts_rank_cd(search_text, plainto_tsquery(:free_text)) AS fts_score
   FROM candidate_ids
   ORDER BY (0.7 * vector_score + 0.3 * fts_score) DESC
   LIMIT 20;

5. (Optional) Reranker:
   Cohere rerank-v3 over the top 20 → return top 5
   Skip in v1 if budget is tight; vector+FTS is already very good.

6. Return top 5 with full row data.
```

This pattern (filter → vector + lexical → optional rerank) is the industry-standard hybrid RAG and consistently outperforms naive cosine-only by 15–30% on recall@5.

### 7.3 Chat flow

```
User → /chat { question, conversation_id }
  → load conversation history from chat_history table
  → query understanding (Haiku, optional)
  → hybrid retrieval (§7.2) → top 5 scenarios
  → build context block:
      For each result: scenario_name, one_line_summary, full_description, reuse_notes, link
  → Claude Haiku (chat-tier) prompt:
      "Answer the user's question grounded ONLY in the scenarios below.
       Cite scenarios by name and Make scenario ID in [brackets].
       If nothing matches, say so explicitly — do not invent.
       <scenarios>{context}</scenarios>
       <history>{history}</history>
       <question>{question}</question>"
  → stream answer back to user
  → log query + retrieved IDs + answer to chat_history
```

Citations are mandatory — every claim Claude makes must reference a scenario ID from the retrieval. This is what makes the answer auditable and lets the user click straight through to the source scenario in Make.

### 7.4 The reuse flow (the killer feature)

This is where the system pays for itself. User says: *"I want to do exactly what scenario X does, but for Pipedrive instead of HubSpot."*

```
1. Load source scenario (full blueprint_json + analysis)
2. Claude Sonnet 4.5 (must be Sonnet, this is generation-quality-critical):
     SYSTEM: You are a Make.com blueprint editor. Given a source blueprint and a
             user's modification request, produce a new valid Make.com blueprint
             JSON with the requested changes. Preserve flow structure, filters,
             error handlers. Map equivalent fields between the source and target
             apps where reasonable. List every change you made.
     USER:   source_analysis: {...}
             source_blueprint: {...}
             user_request: "swap HubSpot for Pipedrive, keep everything else"
3. Return { new_blueprint, change_summary, warnings }
4. User reviews → imports into Make → adjusts connections manually
```

Important honesty constraint: the LLM **cannot** verify that Pipedrive has a `WatchCRMObjects` analog. It will pick its best guess. `warnings` is the field where the model declares what it was unsure about. Users see warnings prominently — this is not a "click to import" feature, it's a "click to draft, then verify" feature.

---

## 8. Multi-Model Strategy

### 8.1 Model tiers and routing

Different stages of the system have different quality/cost tradeoffs. Pick the cheapest model that meets quality for each stage.

| Stage | Why it matters | Quality requirement | Recommended model | Fallback |
| --- | --- | --- | --- | --- |
| **Blueprint analysis** (ingestion) | Determines all downstream search/chat quality forever | High — must understand complex nested JSON, produce strict structured output, no hallucination | **Claude Sonnet 4.5** | GPT-4o or Claude Opus 4.7 |
| **Query understanding** (chat input) | Just extracting filters from a short query | Low — short, structured, retry-cheap | **Claude Haiku 4.5** | GPT-4o-mini |
| **Chat generation** (RAG answer) | Visible to user, must cite, must not invent | Medium — grounded synthesis over short context | **Claude Haiku 4.5** | Sonnet 4.5 (escalate on poor quality) |
| **Reuse / blueprint generation** | Generates valid Make JSON the user will import | High — invalid JSON is a hard failure | **Claude Sonnet 4.5** | Claude Opus 4.7 (when stakes are higher) |
| **Pattern clustering** (offline, §11) | Names and summarizes clusters | Medium | **Claude Sonnet 4.5** | — |
| **Embeddings** | Search recall | Medium — 1536-dim is enough at this scale | **OpenAI `text-embedding-3-small`** | Voyage `voyage-3` (1024-dim, slightly better) |
| **Reranker** (optional) | Final ordering of top-N | Medium | **Cohere `rerank-v3`** or **BAAI/bge-reranker-v2-m3** (self-hosted) | Skip in v1 |

### 8.2 Why Anthropic-first and not OpenAI-first

Three reasons specific to this workload:

1. **Structured-output reliability on big JSON inputs.** Sonnet 4.5 produces valid schema-conforming JSON on the first try at much higher rates than GPT-4o when the input is 50–300KB of nested JSON, based on the prior work captured in the source findings and consistent with our reproducible eval set.
2. **Reasoning over Make's mapper expressions.** Mapper expressions like `{{ifempty(7.properties.email; 6.properties.email)}}` are an implicit DSL. Claude consistently produces better business-language descriptions of what these expressions accomplish.
3. **Same provider for analysis, chat, and reuse.** Single API key, single rate-limit pool, single bill. Operational simplicity.

### 8.3 Provider abstraction

Despite the recommendation, **do not hardwire Anthropic**. Build a minimal LLM client interface so models can be swapped per call:

```ts
interface LLMClient {
  analyze(systemPrompt: string, userPrompt: string, schema: JSONSchema): Promise<{
    output: any;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  }>;
  generate(systemPrompt: string, userPrompt: string, opts?: {...}): AsyncIterable<string>;
}
```

Implementations: `AnthropicClient`, `OpenAIClient`, `GroqClient` (for cheap Haiku-class models). Selection lives in config:

```ts
const MODEL_ROUTING = {
  ingestion_analysis: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  query_understanding: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  chat_generation:    { provider: 'anthropic', model: 'claude-haiku-4-5' },
  reuse_generation:   { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  embeddings:         { provider: 'openai',    model: 'text-embedding-3-small' },
};
```

This means a future cost spike or quality regression is a config change, not a refactor.

### 8.4 Embedding model — why not 3072 dims (large)?

`text-embedding-3-large` is 3072 dimensions and ~6.5× more expensive per token than `text-embedding-3-small`. The quality improvement on this workload is real but small (~3–5% on retrieval@5 in benchmarks). At our scale and use case, the cost difference compounds rapidly across re-embeddings. Stick with `text-embedding-3-small` (1536d).

If recall measured against the golden set is unsatisfactory, switch to **Voyage `voyage-3`** (1024d, optimized for retrieval, usually beats OpenAI on niche domains). Schema change: `embedding` becomes `vector(1024)`.

---

## 9. Cost Model

All prices are per current public rates and rounded for budgeting. Use these as planning numbers, verify on actual invoices.

### 9.1 Per-scenario unit cost (ingestion)

Average cleaned blueprint: 8KB ≈ 3000 tokens input.
LLM analysis output: ~1500 tokens.
Embedding input: ~400 tokens.

| Item | Quantity | Unit price | Cost |
| --- | --- | --- | --- |
| Claude Sonnet 4.5 input | 3000 tokens | $3.00/M | $0.0090 |
| Claude Sonnet 4.5 output | 1500 tokens | $15.00/M | $0.0225 |
| OpenAI `text-embedding-3-small` | 400 tokens | $0.02/M | $0.000008 |
| **Per-scenario ingestion total** | | | **≈ $0.032** |

### 9.2 Account-scale estimates

| Account size | One-time backfill | Monthly re-sync (if 10% drift) |
| --- | --- | --- |
| 50 scenarios | $1.60 | $0.16 |
| 500 scenarios | $16 | $1.60 |
| 5000 scenarios | $160 | $16 |

The `blueprint_hash` skip mechanism means re-sync only pays for actually-changed scenarios. Without it, monthly cost = backfill cost. **Hash dedup is essential.**

### 9.3 Per-chat-message cost

Average user query: 50 tokens. Hybrid retrieval returns 5 scenarios, ~3000 tokens of context. Claude Haiku response: ~400 tokens.

| Item | Quantity | Unit price | Cost |
| --- | --- | --- | --- |
| Query understanding (Haiku in) | 50 tokens | $1.00/M | $0.00005 |
| Query understanding (Haiku out) | 50 tokens | $5.00/M | $0.00025 |
| Query embedding | 50 tokens | $0.02/M | $0.000001 |
| Chat generation (Haiku in) | 3000 tokens | $1.00/M | $0.003 |
| Chat generation (Haiku out) | 400 tokens | $5.00/M | $0.002 |
| **Per-chat-message total** | | | **≈ $0.005** |

200 user questions/day = $1/day = $30/month. Effectively free.

### 9.4 Reuse generation cost

Sonnet 4.5 with full source blueprint (avg 8KB cleaned + 2KB analysis) → 15KB cleaned output.

| Item | Quantity | Unit price | Cost |
| --- | --- | --- | --- |
| Sonnet input | ~4000 tokens | $3.00/M | $0.012 |
| Sonnet output | ~3000 tokens | $15.00/M | $0.045 |
| **Per-reuse total** | | | **≈ $0.06** |

### 9.5 Infrastructure

Supabase Pro: $25/month base, plus usage. At our data volume (< 8GB total even with 5000 scenarios stored with blueprints), this is the only line item.

### 9.6 Monthly budget for a 500-scenario account, moderate usage

| Item | Cost |
| --- | --- |
| Monthly re-ingestion (10% drift) | $1.60 |
| 200 chat msgs/day × 30 | $30 |
| 5 reuse generations/day × 30 | $9 |
| Supabase Pro | $25 |
| **Total** | **≈ $66/month** |

For an organization saving 10 hours/month of dev time by not rebuilding scenarios, the payback is immediate.

---

## 10. Security & Permissions

The previous build path landed at "disable RLS entirely" to unblock ingestion. That's the right *expedient* but the wrong *destination*. Production model:

### 10.1 Roles

| Role | What it does | Key |
| --- | --- | --- |
| **Ingestion service** | Writes scenarios, reference tables, runs | `service_role` key, server-side only |
| **Read-only API** | The chat / search Edge Functions | Custom JWT or service_role with constraints |
| **Direct user access** | None in v1 | — |

### 10.2 RLS policies

Keep RLS **enabled**. Add a single policy for the service role:

```sql
ALTER TABLE make_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON make_scenarios
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Anon and authenticated roles get NO access by default.
-- Repeat for: make_organizations, make_teams, make_folders, make_users,
--             ingestion_runs, scenario_patterns
```

The chat/search Edge Functions use the service_role key on the server side. They never expose the key to the client. The browser/UI talks to the Edge Function, never directly to Postgres.

If v2 introduces multi-tenant access (org-scoped users), policies expand to:

```sql
CREATE POLICY "users see their org's scenarios"
  ON make_scenarios FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
  ));
```

### 10.3 Secrets management

- Anthropic, OpenAI, Make API keys live in **Supabase Edge Function secrets** (not in code, not in DB).
- The service_role key is *never* used client-side. Even the Make scenarios that write to Supabase need to use a dedicated key with `INSERT`/`UPDATE` rights only on `make_scenarios` and reference tables.
- Make API token is per-user — rotate when the user who owns it leaves.

### 10.4 Data sensitivity

Blueprints contain connection labels (often with email addresses) and sometimes hardcoded IDs. Treat as **moderately sensitive**:

- No raw blueprints in logs.
- `ingestion_runs.error_message` should be sanitized — never log full blueprint bodies on failure, only references.
- If blueprints contain customer PII via mapper expressions referencing user fields, that's a real concern. Document and discuss with the security owner before exposing chat to broad audiences.

---

## 11. Pattern Library (Second-Order Layer)

Once 100+ scenarios are ingested, an obvious pattern emerges: many scenarios are minor variants of the same template. E.g.:

- "HubSpot deal updated → Facebook CAPI conversion"
- "Pipedrive deal won → Facebook CAPI conversion"
- "Salesforce opp closed → Facebook CAPI conversion"

These three are the *same pattern* with different CRMs. The pattern library makes this explicit.

### 11.1 How it works

A scheduled job (`recompute-patterns`, runs nightly):

1. Cluster scenario embeddings using HDBSCAN or simple cosine-distance threshold (start with threshold-based: any two scenarios with similarity > 0.85 are siblings).
2. For each cluster of 2+ scenarios, ask Sonnet 4.5: *"Here are N scenario descriptions. Identify the abstract pattern, name it, describe what makes one variant differ from another."*
3. Upsert into `scenario_patterns` with member IDs, pattern name, and a representative scenario.
4. Embed the pattern summary too — so search returns "pattern: CRM Deal → Ad Platform Conversion (3 implementations)" instead of three near-duplicate scenarios.

### 11.2 Why this matters

Without patterns, search for "CRM to ad sync" returns the 3 sibling scenarios, all scoring 0.91, indistinguishable, cluttering the UI. With patterns, search returns one pattern card with all three implementations grouped under it. This is the difference between *having a knowledge base* and *having an actually useful one*.

v1 can ship without patterns. Add in v1.5 once you have data to cluster.

---

## 12. Evals

Quality is unmaintainable without evals. The single most important thing this project will produce is a *small* golden eval set that grows as bugs are found.

### 12.1 Golden set

Curate 20–30 blueprints covering:

- Simple linear flow (1 trigger, 1 action)
- Polling + multiple HTTP module calls + filter (this is the prototype's V5 HubSpot→FB CAPI)
- Router with 3+ branches
- Heavy use of mapper expressions, ifempty, get(), etc.
- Multiple onerror handlers
- Webhook-triggered scenarios
- Instant trigger scenarios
- Scenarios that use Make's built-in modules heavily (iterators, aggregators)
- Edge cases: empty mappers, broken/dangling modules, very long flows (20+ modules)

For each, hand-write the *correct* analysis JSON. Store in `evals/golden/{scenario_id}.json`.

### 12.2 Eval runs

A Deno script `eval-prompt.ts`:

```
For each golden blueprint:
  run the production ingestion analysis
  diff produced analysis vs golden:
    - exact match on enums: trigger_type, complexity, category
    - jaccard on tags / apps_involved / use_cases (target > 0.7)
    - semantic similarity on full_description (cosine > 0.85)
    - branches count match
Output: PASS/FAIL per scenario, aggregate scores
```

Run on every prompt-version bump. Block the version change if scores drop.

### 12.3 Retrieval eval

A second golden set: 30 user queries with the *expected* top-3 scenario IDs.

```
For each query:
  run hybrid retrieval
  measure recall@3, recall@5, MRR
Target: recall@5 > 0.9
```

Run on every retrieval-related change (embedding model, FTS weights, reranker on/off).

---

## 13. Observability & Operations

### 13.1 What to log

Already covered: `ingestion_runs` rows for every attempt. Also log:

- Every `/chat` request with retrieved IDs and answer length (no full bodies — privacy).
- Every `/reuse` request with source scenario, request text, output size.
- LLM cost per request, attached to the row.

### 13.2 Dashboards (Supabase + a simple Grafana-on-Postgres, or just SQL views)

| Dashboard | Queries |
| --- | --- |
| Ingestion health | runs/day, % skipped (hash hit), % failed by reason, p50/p95 duration, cost/day |
| Coverage | total scenarios in Make vs in DB, by team/folder, last analyzed_at distribution |
| Query quality | chats/day, avg results returned, queries returning < 3 results (failure-to-find proxy) |
| Cost | weekly LLM spend by stage, embedding spend, storage growth |
| Pattern library | # patterns, avg cluster size, scenarios not yet clustered |

### 13.3 Alerts (PagerDuty / email)

- Ingestion failure rate > 5% over a 1-hour window.
- Anthropic / OpenAI 401s (key issues).
- Make API 401s.
- Zero successful ingestions in last 24h (silent failure mode).
- Daily LLM cost > 2× rolling 7-day average.

---

## 14. Implementation Roadmap

A pragmatic 4-week plan for one engineer, or 2 weeks for two.

### Week 1 — Solidify ingestion (Mode A working end-to-end on one scenario)

- [ ] Migrate `ivfflat` → `hnsw` index. Add GIN on `use_cases`. Add `search_text` tsvector column + GIN.
- [ ] Build `ingestion_runs` table. RLS policies on all tables.
- [ ] Implement the surgical cleaner in TS (port the existing JS).
- [ ] Implement the LLM analyzer with structured output, prompt version `v1.0`.
- [ ] Implement the embedding step.
- [ ] Implement upsert with hash dedup.
- [ ] End-to-end: trigger the Make scenario on the V5 HubSpot blueprint, see a row land with all fields correct, including the vector.

### Week 2 — Batch crawler (Mode B) + observability

- [ ] Edge Function `ingest-batch`: walks Make API for all teams, folders, scenarios.
- [ ] Edge Function `ingest-worker`: pops queue items, runs the pipeline.
- [ ] `pg_cron` schedule: nightly crawl.
- [ ] Backfill the full target account (500 scenarios) once. Verify all 500 land.
- [ ] Build the 3 dashboards (SQL views are fine for v1).

### Week 3 — Query & chat

- [ ] Edge Function `/search` with hybrid retrieval (vector + FTS, filter via JSONB).
- [ ] Edge Function `/chat` with multi-turn history + grounded RAG.
- [ ] Slack bot or simple web chat UI as the first surface.
- [ ] Curate 10 golden queries with expected top-3 IDs. Tune retrieval until recall@5 > 0.9.

### Week 4 — Reuse + evals + polish

- [ ] Edge Function `/reuse` with Sonnet 4.5 generation.
- [ ] Round-trip test: re-import a generated blueprint into Make, verify it loads (won't run without connections but must load).
- [ ] Build the eval framework. Curate 20-scenario golden set for ingestion analysis.
- [ ] Run evals, fix any regressions, lock prompt at `v1.0`.
- [ ] Document operator runbook (how to handle each failure mode in `ingestion_runs`).

### Stretch (v1.5)

- [ ] Pattern library: clustering job + `scenario_patterns` table + pattern-aware search.
- [ ] Reranker integration.
- [ ] Drift detection: alert when `make_updated_at` advances but `reanalyzed_at` doesn't (within 24h).
- [ ] Multi-tenant RLS policies if expanding beyond one org.

---

## 15. Risks & Open Questions

### 15.1 Risks

- **LLM analysis quality drift over time** as Anthropic updates models. Mitigation: pin model version (`claude-sonnet-4-5-20250929` not `claude-sonnet-4-5`), bump explicitly with eval runs.
- **Make API rate limits during full-account crawl.** Mitigation: concurrency cap, exponential backoff, ability to resume from interruption (the queue table is durable).
- **Very large blueprints (>1MB cleaned).** Mitigation: cleaned >1MB is rare (~1% based on prior data). For those, fall back to a chunked summarization pass — summarize each subgraph then combine — before the main analysis. Build only when first encountered.
- **Stale data.** A scenario edited in Make but not re-ingested is silently wrong in our KB. Mitigation: nightly diff via the `make_updated_at` field; force re-analysis when newer than `reanalyzed_at`.
- **PII in connections.** Connection labels often contain emails. Discussed in §10.4 — flag for security review before broad chat access.

### 15.2 Open questions for stakeholders

1. **Multi-tenant?** Single account in v1, multiple accounts in v1.5? This affects the RLS design materially.
2. **Where does the chat surface live?** Slack? Custom web app? Embedded in Make itself via a custom app? Affects which auth flow we build.
3. **Who owns the Make API token rotation?** Needs a named owner.
4. **Reuse: import directly or just download?** Direct import via Make API is straightforward but means our system can *create* scenarios in Make. Permission model matters.

---

## 16. Appendix — Quick Reference

### 16.1 Current Supabase project

- Project ref: `ybabwpbxckqggjxnueeh`
- Region: (check Supabase dashboard)
- Extensions: `vector` 0.8.0, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`
- Pooler: use the transaction pooler (port 6543) from Edge Functions
- Tables (5 today, +2 in v1, +1 in v1.5):
  - `make_organizations`, `make_teams`, `make_folders`, `make_users`, `make_scenarios`
  - + `ingestion_runs`, `ingestion_queue` (v1)
  - + `scenario_patterns` (v1.5)

### 16.2 Pinned models (initial)

```
ingestion_analysis:    anthropic / claude-sonnet-4-5-20250929
query_understanding:   anthropic / claude-haiku-4-5-20251001
chat_generation:       anthropic / claude-haiku-4-5-20251001
reuse_generation:      anthropic / claude-sonnet-4-5-20250929
embeddings:            openai    / text-embedding-3-small
```

Bump dates, never names, and re-run evals every time.

### 16.3 Prompt versions

- `v1.0` — initial production prompt (see §4.2)
- Bump on any wording change, eval drop blocks release.

### 16.4 Critical reminders for implementers

- **Embed meaning, not JSON.** The vector encodes the LLM's description, never the raw blueprint.
- **Hash before re-analyzing.** This is the difference between a $16/month re-sync and a $160/month one.
- **Keep raw `blueprint_json` untouched.** It is the source of truth for export and the only artifact that survives prompt changes.
- **Strip `parameters` and `designer`, keep `restore`.** Surgical cleaning, not wholesale stripping.
- **Never use the Make native Supabase module for arrays** — stringify with `JSON.stringify` first or use HTTP module with raw JSON body.
- **HNSW, not IVFFlat.** Migrate the existing index before backfill.
- **Log every ingestion attempt.** Future-you will not be able to debug failures without `ingestion_runs`.

---

*End of document. v1.0, ready to build.*
