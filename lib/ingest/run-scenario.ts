// Single source of truth for the ingest pipeline.
// Called from:
//   - app/api/ingest/scenario/route.ts  (1 scenario, signed-in admin)
//   - app/api/ingest/batch/route.ts     (N scenarios, signed-in admin)
//   - app/api/ingest/manual/route.ts    (legacy alias of /scenario)
//   - scripts/backfill.ts               (one-time CLI backfill)
//
// Pipeline:
//   1. Fetch scenario meta + blueprint from Make
//   2. SHA-256 hash; skip if hash + prompt_version match existing row
//   3. Surgical clean
//   4. Anthropic Sonnet analysis (structured output, retry-once)
//   5. OpenAI embedding
//   6. Upsert reference tables (org / team / folder / user)
//   7. Upsert make_scenarios (with optional Storage offload if blueprint > 500KB)
//   8. Insert ingestion_runs audit row (cost + duration)

import '@/lib/utils/assert-server'
import { MakeClient } from '@/lib/make/client'
import type { MakeBlueprint, MakeScenarioListItem } from '@/lib/make/types'
import { cleanBlueprint } from '@/lib/make/clean-blueprint'
import { sha256OfJson } from '@/lib/utils/hash'
import { analyzeBlueprint } from '@/lib/llm/anthropic'
import { embed, buildEmbeddingInput } from '@/lib/llm/openai-embeddings'
import { createServiceClient } from '@/lib/supabase/service'
import type { Json, TablesInsert } from '@/lib/supabase/types'
import { MakeAPIError } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'

type ScenarioInsert = TablesInsert<'make_scenarios'>

// MakeBlueprint has concrete fields, not the open-ended { [k: string]: Json } shape Postgres
// expects for `jsonb` columns. The runtime values are JSON-serializable; coerce for the type
// checker via `unknown`. Safer than `any` because it forces us to remember it's an unsafe widen.
const asJson = (v: unknown): Json => v as Json

export type RunStatus =
  | 'success'
  | 'skipped_hash_match'
  | 'failed_fetch'
  | 'failed_clean'
  | 'failed_llm'
  | 'failed_embed'
  | 'failed_insert'

export type Trigger = 'manual' | 'batch' | 'webhook' | 'recurring'

export interface RunInput {
  scenarioId: string
  force?: boolean
  trigger?: Trigger
  /** Override the org id to associate the scenario with (defaults to MAKE_DEFAULT_ORG_ID). */
  orgId?: string | null
}

export interface RunResult {
  status: RunStatus
  scenario_id: string
  blueprint_hash?: string
  llm_model_used?: string
  llm_cost_usd?: number
  embedding_cost_usd?: number
  duration_ms: number
  error?: string
}

interface RunRecord {
  scenario_id: string
  trigger: Trigger
  status: RunStatus
  blueprint_hash?: string
  llm_model_used?: string
  llm_prompt_version?: string
  llm_tokens_in?: number
  llm_tokens_out?: number
  llm_cost_usd?: number
  embedding_tokens?: number
  embedding_cost_usd?: number
  duration_ms?: number
  error_message?: string
  error_stack?: string
  started_at: string
  finished_at?: string
}

export async function runScenarioIngestion(input: RunInput): Promise<RunResult> {
  const { scenarioId, force = false, trigger = 'manual', orgId: orgIdOverride } = input

  const startedAtIso = new Date().toISOString()
  const startedAtMs = Date.now()
  const supa = createServiceClient()
  const make = new MakeClient()
  const orgId = orgIdOverride ?? process.env.MAKE_DEFAULT_ORG_ID ?? null
  const promptVersion = process.env.PROMPT_VERSION ?? 'v1.0'
  const log = logger.child({ scenario_id: scenarioId, trigger })

  const run: RunRecord = {
    scenario_id: scenarioId,
    trigger,
    status: 'success',
    started_at: startedAtIso,
  }

  async function finalize(result: Partial<RunResult>, _http?: number): Promise<RunResult> {
    run.duration_ms = Date.now() - startedAtMs
    run.finished_at = new Date().toISOString()
    const { error } = await supa.from('ingestion_runs').insert(run)
    if (error) log.error('Failed to insert ingestion_runs row', { error: error.message })
    return {
      status: run.status,
      scenario_id: scenarioId,
      blueprint_hash: run.blueprint_hash,
      llm_model_used: run.llm_model_used,
      llm_cost_usd: run.llm_cost_usd,
      embedding_cost_usd: run.embedding_cost_usd,
      duration_ms: run.duration_ms ?? 0,
      ...result,
      // http is metadata for the caller (e.g. Next.js route) but not part of RunResult shape.
    }
  }

  // ── 1. Fetch scenario meta + blueprint
  let scenarioMeta: MakeScenarioListItem | null = null
  let blueprint: MakeBlueprint
  try {
    scenarioMeta = await make.getScenario(scenarioId).catch(() => null)
    blueprint = await make.getBlueprint(scenarioId)
  } catch (err) {
    run.status = 'failed_fetch'
    run.error_message = err instanceof Error ? err.message : String(err)
    run.error_stack = err instanceof Error ? err.stack : undefined
    log.error('Make API fetch failed', { error: run.error_message })
    return finalize({ error: run.error_message }, err instanceof MakeAPIError ? err.status : 500)
  }

  const scenarioName = blueprint.name ?? scenarioMeta?.name ?? `Scenario ${scenarioId}`
  const teamId = scenarioMeta?.teamId ?? null
  const folderId = scenarioMeta?.folderId ?? null
  const createdBy = scenarioMeta?.createdByUser ?? null

  // ── 2. Hash + skip check
  const blueprintHash = sha256OfJson(blueprint)
  run.blueprint_hash = blueprintHash

  if (!force) {
    const { data: existing } = await supa
      .from('make_scenarios')
      .select('blueprint_hash, llm_prompt_version')
      .eq('make_scenario_id', scenarioId)
      .maybeSingle()
    if (
      existing &&
      existing.blueprint_hash === blueprintHash &&
      existing.llm_prompt_version === promptVersion
    ) {
      run.status = 'skipped_hash_match'
      log.info('Hash match — skipping re-analysis', { hash: blueprintHash.slice(0, 8) })
      return finalize({})
    }
  }

  // ── 3. Surgical clean
  let cleaned: MakeBlueprint
  try {
    cleaned = cleanBlueprint(blueprint)
  } catch (err) {
    run.status = 'failed_clean'
    run.error_message = err instanceof Error ? err.message : String(err)
    log.error('Blueprint cleaner threw', { error: run.error_message })
    return finalize({ error: run.error_message })
  }

  // ── 4. Anthropic analysis
  let analysis
  try {
    analysis = await analyzeBlueprint({ scenarioName, cleanedBlueprint: cleaned })
  } catch (err) {
    run.status = 'failed_llm'
    run.error_message = err instanceof Error ? err.message : String(err)
    run.error_stack = err instanceof Error ? err.stack : undefined
    log.error('Anthropic analysis failed', { error: run.error_message })
    return finalize({ error: run.error_message })
  }
  run.llm_model_used = analysis.usage.model
  run.llm_prompt_version = analysis.prompt_version
  run.llm_tokens_in = analysis.usage.input_tokens
  run.llm_tokens_out = analysis.usage.output_tokens
  run.llm_cost_usd = analysis.usage.cost_usd

  const a = analysis.output

  // ── 5. Embedding
  let embedding
  try {
    embedding = await embed(buildEmbeddingInput(a))
  } catch (err) {
    run.status = 'failed_embed'
    run.error_message = err instanceof Error ? err.message : String(err)
    log.error('OpenAI embedding failed', { error: run.error_message })
    return finalize({ error: run.error_message })
  }
  run.embedding_tokens = embedding.tokens
  run.embedding_cost_usd = embedding.cost_usd

  // ── 6. Upsert reference tables (best-effort)
  let orgRowId: string | null = null
  let teamRowId: string | null = null
  let folderRowId: string | null = null
  let userRowId: string | null = null
  let orgName: string | null = null
  let teamName: string | null = null
  let folderName: string | null = null
  let createdByName: string | null = null

  // Fetch real names from Make API (cached on the client across the batch).
  // Each is best-effort: if a lookup fails, we fall back to the placeholder.
  if (orgId) {
    let realOrgName: string = `Org ${orgId}`
    try {
      const o = await make.getOrganization(orgId)
      if (o?.name) realOrgName = o.name
    } catch (err) {
      log.warn('getOrganization failed; using placeholder name', {
        org_id: orgId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    const { data } = await supa
      .from('make_organizations')
      .upsert(
        { make_org_id: String(orgId), org_name: realOrgName },
        { onConflict: 'make_org_id', ignoreDuplicates: false },
      )
      .select('id, org_name')
      .single()
    if (data) {
      orgRowId = data.id
      orgName = data.org_name
    }
  }
  if (teamId !== null && teamId !== undefined && orgRowId) {
    let realTeamName: string = `Team ${teamId}`
    try {
      const t = await make.getTeam(teamId)
      if (t?.name) realTeamName = t.name
    } catch (err) {
      log.warn('getTeam failed; using placeholder name', {
        team_id: teamId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    const { data } = await supa
      .from('make_teams')
      .upsert(
        { make_team_id: String(teamId), team_name: realTeamName, org_id: orgRowId },
        { onConflict: 'make_team_id', ignoreDuplicates: false },
      )
      .select('id, team_name')
      .single()
    if (data) {
      teamRowId = data.id
      teamName = data.team_name
    }
  }
  if (folderId !== null && folderId !== undefined && teamRowId && teamId !== null && teamId !== undefined) {
    let realFolderName: string = `Folder ${folderId}`
    try {
      const folders = await make.listFolders(teamId)
      const f = folders.find((x) => String(x.id) === String(folderId))
      if (f?.name) realFolderName = f.name
    } catch (err) {
      log.warn('listFolders failed; using placeholder name', {
        folder_id: folderId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    const { data } = await supa
      .from('make_folders')
      .upsert(
        { make_folder_id: String(folderId), folder_name: realFolderName, team_id: teamRowId },
        { onConflict: 'make_folder_id', ignoreDuplicates: false },
      )
      .select('id, folder_name')
      .single()
    if (data) {
      folderRowId = data.id
      folderName = data.folder_name
    }
  }
  if (createdBy?.id) {
    const { data } = await supa
      .from('make_users')
      .upsert(
        {
          make_user_id: String(createdBy.id),
          user_name: createdBy.name ?? null,
          email: createdBy.email ?? null,
        },
        { onConflict: 'make_user_id', ignoreDuplicates: false },
      )
      .select('id, user_name')
      .single()
    if (data) {
      userRowId = data.id
      createdByName = data.user_name
    }
  }

  // ── 7. Upsert make_scenarios
  const bpRaw = JSON.stringify(blueprint)
  const useStorage = bpRaw.length > 500_000

  const row: ScenarioInsert = {
    make_scenario_id: scenarioId,
    scenario_name: scenarioName,
    org_id: orgRowId,
    make_org_id: orgId ? String(orgId) : null,
    org_name: orgName,
    team_id: teamRowId,
    make_team_id: teamId !== null && teamId !== undefined ? String(teamId) : null,
    team_name: teamName,
    folder_id: folderRowId,
    make_folder_id: folderId !== null && folderId !== undefined ? String(folderId) : null,
    folder_name: folderName,
    created_by_user_id: userRowId,
    make_created_by_id: createdBy?.id ? String(createdBy.id) : null,
    created_by_name: createdByName,
    // LLM analysis
    one_line_summary: a.one_line_summary,
    business_purpose: a.business_purpose,
    full_description: a.full_description,
    data_flow: a.data_flow,
    branches_summary: a.branches,
    error_handling: a.error_handling,
    reuse_notes: a.reuse_notes,
    // Structured tags
    apps_involved: a.apps_involved,
    tags: a.tags,
    use_cases: a.use_cases,
    category: a.category,
    trigger_type: a.trigger_type,
    trigger_app: a.trigger_app,
    trigger_event: a.trigger_event,
    complexity: a.complexity,
    // Blueprint storage
    blueprint_json: useStorage ? null : asJson(blueprint),
    blueprint_clean_json: asJson(cleaned),
    blueprint_storage_url: useStorage ? `blueprints/${scenarioId}/${blueprintHash}.json` : null,
    blueprint_hash: blueprintHash,
    // LLM audit
    llm_analysis_json: a,
    llm_model_used: analysis.usage.model,
    llm_prompt_version: analysis.prompt_version,
    analyzed_at: new Date().toISOString(),
    // Embedding (Postgres vector type accepts a string like "[0.1,0.2,...]")
    embedding: `[${embedding.vector.join(',')}]`,
    // Timestamps
    make_created_at: scenarioMeta?.created ?? null,
    make_updated_at: scenarioMeta?.lastEdit ?? null,
    reanalyzed_at: new Date().toISOString(),
  }

  if (useStorage) {
    const path = `${scenarioId}/${blueprintHash}.json`
    const { error: upErr } = await supa.storage
      .from('blueprints')
      .upload(path, bpRaw, { contentType: 'application/json', upsert: true })
    if (upErr) {
      // Bucket may not exist on first install — fall back to inline JSONB.
      log.warn('Storage upload failed, falling back to inline JSONB', { error: upErr.message })
      row.blueprint_json = asJson(blueprint)
      row.blueprint_storage_url = null
    }
  }

  const { error: upsertErr } = await supa
    .from('make_scenarios')
    .upsert(row, { onConflict: 'make_scenario_id' })

  if (upsertErr) {
    run.status = 'failed_insert'
    run.error_message = upsertErr.message
    log.error('Upsert make_scenarios failed', { error: upsertErr.message })
    return finalize({ error: upsertErr.message })
  }

  run.status = 'success'
  log.info('Ingest complete', {
    cost_usd: (run.llm_cost_usd ?? 0) + (run.embedding_cost_usd ?? 0),
    model: run.llm_model_used,
  })
  return finalize({})
}
