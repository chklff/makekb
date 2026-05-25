// Build "Open in Make" deep-link URLs.
//
// Real Make URL format: {base}/{teamId}/scenarios/{scenarioId}/edit
//   - {base}       — set via MAKE_WEB_BASE_URL env (region-specific: us1, eu1, etc.)
//   - {teamId}     — Make team numeric id (NOT the Supabase UUID — make_scenarios.make_team_id)
//   - {scenarioId} — Make scenario numeric id (make_scenarios.make_scenario_id)
//   - path uses plural "scenarios", not "scenario"
//
// If we don't have the team_id (older rows, RPC results without it), we fall back to the
// Make landing page — the user can navigate from there. We never produce a 404 URL.

const DEFAULT_BASE = 'https://eu1.make.com'

/**
 * Resolve the Make web base URL. Priority:
 *   1. MAKE_WEB_BASE_URL (explicit override)
 *   2. MAKE_API_BASE_URL with `/api/v2` stripped — same region as the API client
 *   3. eu1 default
 *
 * Setting only MAKE_API_BASE_URL is the common path; we keep both in sync automatically
 * so the API and web URLs never disagree on region.
 */
export function makeWebBase(): string {
  const explicit = process.env.MAKE_WEB_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const apiBase = process.env.MAKE_API_BASE_URL?.trim()
  if (apiBase) return apiBase.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '')
  return DEFAULT_BASE
}

/**
 * Open a specific scenario in Make. Requires `makeTeamId` for the proper team-scoped URL —
 * if missing, returns a base-region URL the user can navigate from.
 */
export function openInMakeUrl(
  makeScenarioId: string | number,
  makeTeamId: string | number | null | undefined,
): string {
  const base = makeWebBase()
  if (makeTeamId === null || makeTeamId === undefined || makeTeamId === '') {
    // Best effort — no team context. Lands on the Make home; user can navigate from there.
    return base
  }
  return `${base}/${makeTeamId}/scenarios/${makeScenarioId}/edit`
}
