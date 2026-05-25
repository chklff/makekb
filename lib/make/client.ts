// Minimal typed client for the Make.com API v2.
// Covers exactly what the ingestion pipeline needs:
//   - list teams in an org
//   - list folders in a team
//   - list scenarios (optionally filtered by team or folder)
//   - get a scenario's blueprint
//
// Auth is the Make API token in `Authorization: Token <token>` header.
// Base URL is region-specific: https://eu1.make.com/api/v2 or https://us1.make.com/api/v2.

import '@/lib/utils/assert-server'
import { MakeAPIError } from '@/lib/utils/errors'
import type {
  MakeBlueprint,
  MakeBlueprintResponse,
  MakeFolderListItem,
  MakeFoldersResponse,
  MakeOrgListItem,
  MakeOrgResponse,
  MakeScenarioInterfaceResponse,
  MakeScenarioListItem,
  MakeScenariosResponse,
  MakeTeamListItem,
  MakeTeamResponse,
  MakeTeamsResponse,
} from './types'

const DEFAULT_BASE = process.env.MAKE_API_BASE_URL ?? 'https://eu1.make.com/api/v2'

interface MakeClientOptions {
  token?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export class MakeClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  // Per-instance lookup caches. Cheap to populate (one request each), saves a roundtrip
  // per ingested scenario when running a batch.
  private orgCache = new Map<string, MakeOrgListItem>()
  private teamCache = new Map<string, MakeTeamListItem>()
  private foldersByTeam = new Map<string, MakeFolderListItem[]>()

  constructor(opts: MakeClientOptions = {}) {
    const token = opts.token ?? process.env.MAKE_API_TOKEN
    if (!token) throw new Error('MakeClient: MAKE_API_TOKEN is required')
    this.token = token
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  private async req<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }
    const resp = await this.fetchImpl(url.toString(), {
      headers: {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
      },
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new MakeAPIError(resp.status, body.slice(0, 500), { path, query })
    }
    return (await resp.json()) as T
  }

  async getOrganization(orgId: number | string): Promise<MakeOrgListItem> {
    const key = String(orgId)
    const cached = this.orgCache.get(key)
    if (cached) return cached
    const data = await this.req<MakeOrgResponse>(`/organizations/${orgId}`)
    this.orgCache.set(key, data.organization)
    return data.organization
  }

  async getTeam(teamId: number | string): Promise<MakeTeamListItem> {
    const key = String(teamId)
    const cached = this.teamCache.get(key)
    if (cached) return cached
    const data = await this.req<MakeTeamResponse>(`/teams/${teamId}`)
    this.teamCache.set(key, data.team)
    return data.team
  }

  async listTeams(orgId: number | string): Promise<MakeTeamListItem[]> {
    const data = await this.req<MakeTeamsResponse>('/teams', { organizationId: String(orgId) })
    // Prime the per-team cache while we're at it.
    for (const t of data.teams) this.teamCache.set(String(t.id), t)
    return data.teams
  }

  async listFolders(teamId: number | string): Promise<MakeFolderListItem[]> {
    const key = String(teamId)
    const cached = this.foldersByTeam.get(key)
    if (cached) return cached
    const data = await this.req<MakeFoldersResponse>('/scenarios-folders', { teamId: key })
    this.foldersByTeam.set(key, data.scenariosFolders)
    return data.scenariosFolders
  }

  /**
   * Find a folder's metadata across all teams in an org. Used when the caller knows folderId
   * but not teamId. The Make `/scenarios-folders` response does NOT include teamId on each
   * folder, so we annotate it from the iteration context.
   */
  async findFolder(orgId: number | string, folderId: number | string): Promise<MakeFolderListItem | null> {
    const teams = await this.listTeams(orgId)
    for (const t of teams) {
      const folders = await this.listFolders(t.id)
      const f = folders.find((x) => String(x.id) === String(folderId))
      if (f) return { ...f, teamId: t.id }
    }
    return null
  }

  /** List scenarios in a team. Paginates internally. */
  async listScenarios(opts: {
    teamId: number | string
    folderId?: number | string
    limit?: number
  }): Promise<MakeScenarioListItem[]> {
    const pageSize = opts.limit ?? 1000
    const results: MakeScenarioListItem[] = []
    let offset = 0
    // Defensive: hard cap to avoid infinite loops on a misbehaving API
    for (let i = 0; i < 20; i++) {
      const data = await this.req<MakeScenariosResponse>('/scenarios', {
        teamId: String(opts.teamId),
        folderId: opts.folderId !== undefined ? String(opts.folderId) : undefined,
        'pg[limit]': pageSize,
        'pg[offset]': offset,
      })
      const batch = data.scenarios ?? []
      results.push(...batch)
      if (batch.length < pageSize) break
      offset += pageSize
    }
    return results
  }

  async getBlueprint(scenarioId: number | string): Promise<MakeBlueprint> {
    const data = await this.req<MakeBlueprintResponse>(`/scenarios/${scenarioId}/blueprint`)
    return data.response.blueprint
  }

  async getScenario(scenarioId: number | string): Promise<MakeScenarioListItem> {
    const data = await this.req<{ scenario: MakeScenarioListItem }>(`/scenarios/${scenarioId}`)
    return data.scenario
  }

  /**
   * Fetch the scenario's input/output interface spec. Used by webhook-triggered scenarios
   * (defines accepted input fields) and scenarios callable as sub-scenarios (defines outputs).
   *
   * Returns `null` on 404 — many scenarios don't expose an interface and Make 404s instead
   * of returning empty. We swallow the 404 so callers don't have to.
   */
  async getScenarioInterface(scenarioId: number | string): Promise<MakeScenarioInterfaceResponse | null> {
    try {
      return await this.req<MakeScenarioInterfaceResponse>(`/scenarios/${scenarioId}/interface`)
    } catch (err) {
      if (err instanceof MakeAPIError && err.status === 404) return null
      throw err
    }
  }
}
