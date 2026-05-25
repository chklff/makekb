// Type definitions for the slice of the Make.com API we use.
// Only the fields we read are typed; everything else is allowed via index signatures.

// ──────────────────────────────────────────────────────────
// List endpoints (under /scenarios, /teams, /folders, /users)
// ──────────────────────────────────────────────────────────

export interface MakeOrgListItem {
  id: number
  name: string
}
export interface MakeOrgsResponse {
  organizations: MakeOrgListItem[]
}
export interface MakeOrgResponse {
  organization: MakeOrgListItem
}

export interface MakeTeamListItem {
  id: number
  name: string
  organizationId: number
}
export interface MakeTeamsResponse {
  teams: MakeTeamListItem[]
}
export interface MakeTeamResponse {
  team: MakeTeamListItem
}

export interface MakeFolderListItem {
  id: number
  name: string
  teamId: number
}
export interface MakeFoldersResponse {
  scenariosFolders: MakeFolderListItem[]
}

export interface MakeUserListItem {
  id: number
  name: string
  email?: string
}

export interface MakeScenarioListItem {
  id: number
  name: string
  teamId: number
  folderId: number | null
  isActive?: boolean
  scheduling?: unknown
  created?: string
  lastEdit?: string
  createdByUser?: { id: number; name: string; email?: string }
  /**
   * Free-text scenario description from Make UI ("scenario settings → description").
   * Optional + often empty in real orgs, but where filled it's the best single signal of intent.
   * Returned by GET /scenarios/{id}; not present in /scenarios (list) by default.
   */
  description?: string | null
}
export interface MakeScenariosResponse {
  scenarios: MakeScenarioListItem[]
  pg?: {
    sortBy: string
    sortDir: string
    offset: number
    limit: number
  }
}

/**
 * Scenario interface (input + output spec) — returned by GET /scenarios/{id}/interface.
 * Webhook-triggered scenarios expose input fields; scenarios callable as sub-scenarios
 * also expose outputs. Shape is open-ended on Make's side, so we keep it loose.
 */
export interface MakeScenarioInterface {
  input?: unknown
  output?: unknown
  [k: string]: unknown
}
export interface MakeScenarioInterfaceResponse {
  // Make returns either `{ interface: {...} }` or `{ inputs, outputs }` depending on version.
  // We pass the whole envelope through so the analysis prompt can use whatever is present.
  interface?: MakeScenarioInterface
  inputs?: unknown
  outputs?: unknown
  [k: string]: unknown
}

// ──────────────────────────────────────────────────────────
// Blueprint (the meaty one — scenario export JSON)
// ──────────────────────────────────────────────────────────

export interface MakeBlueprint {
  name: string
  flow: MakeModule[]
  metadata?: {
    instant?: boolean
    version?: number
    scenario?: MakeScenarioMeta
    designer?: unknown
    // additional keys allowed
    [k: string]: unknown
  }
}

export interface MakeScenarioMeta {
  roundtrips?: number
  maxErrors?: number
  autoCommit?: boolean
  autoCommitTriggerLast?: boolean
  sequential?: boolean
  slots?: unknown
  confidential?: boolean
  dataloss?: boolean
  dlq?: boolean
  freshVariables?: boolean
}

export interface MakeModule {
  id: number | string
  module: string
  version?: number
  parameters?: Record<string, unknown>
  mapper?: Record<string, unknown>
  filter?: unknown
  onerror?: MakeModule[]
  routes?: MakeRoute[]
  metadata?: {
    designer?: unknown
    parameters?: unknown
    restore?: Record<string, unknown>
    [k: string]: unknown
  }
  // For iterators / aggregators the shape can vary; allow extra keys.
  [k: string]: unknown
}

export interface MakeRoute {
  flow: MakeModule[]
  [k: string]: unknown
}

// Blueprint endpoint wrapper
export interface MakeBlueprintResponse {
  response: {
    blueprint: MakeBlueprint
    name?: string
    scheduling?: unknown
  }
}
