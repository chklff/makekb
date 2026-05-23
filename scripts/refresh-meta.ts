#!/usr/bin/env -S tsx
/**
 * Refresh org / team / folder names from Make.com.
 * No LLM calls, no blueprint re-fetch — just metadata.
 *
 * Use after first ingest (when names defaulted to "Org 77" / "Team 26" placeholders)
 * or whenever someone renames a team / folder in Make.
 *
 *   pnpm tsx scripts/refresh-meta.ts                # refresh everything for MAKE_DEFAULT_ORG_ID
 *   pnpm tsx scripts/refresh-meta.ts --org_id=77    # refresh a specific org
 */
import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { MakeClient } from '@/lib/make/client'

function parseOrgId(argv: string[]): string {
  for (const a of argv.slice(2)) {
    const m = a.match(/^--org_id=(.+)$/)
    if (m) return m[1]!
  }
  const env = process.env.MAKE_DEFAULT_ORG_ID
  if (!env) throw new Error('Provide --org_id=... or set MAKE_DEFAULT_ORG_ID in .env.local')
  return env
}

async function main() {
  const orgId = parseOrgId(process.argv)
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const make = new MakeClient()

  console.info(`▶ Refreshing metadata for Make org ${orgId}`)

  // ── 1. Org name
  try {
    const o = await make.getOrganization(orgId)
    await supa.from('make_organizations').update({ org_name: o.name }).eq('make_org_id', String(orgId))
    console.info(`  ✓ org ${orgId} → "${o.name}"`)
  } catch (err) {
    console.warn(`  ✗ org ${orgId}:`, err instanceof Error ? err.message : err)
  }

  // ── 2. Teams + their folders
  let teamsOk = 0
  let foldersOk = 0
  try {
    const teams = await make.listTeams(orgId)
    for (const t of teams) {
      const { error } = await supa
        .from('make_teams')
        .update({ team_name: t.name })
        .eq('make_team_id', String(t.id))
      if (!error) {
        teamsOk++
        console.info(`  ✓ team ${t.id} → "${t.name}"`)
      }
      try {
        const folders = await make.listFolders(t.id)
        for (const f of folders) {
          const { error: fErr } = await supa
            .from('make_folders')
            .update({ folder_name: f.name })
            .eq('make_folder_id', String(f.id))
          if (!fErr) {
            foldersOk++
            console.info(`    ✓ folder ${f.id} → "${f.name}"`)
          }
        }
      } catch (err) {
        console.warn(`    ✗ folders for team ${t.id}:`, err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    console.warn('  ✗ teams:', err instanceof Error ? err.message : err)
  }

  // ── 3. Propagate the now-correct names into the denormalized columns on make_scenarios.
  // We do the "join" in JS because the JS client doesn't expose a raw multi-table UPDATE.
  console.info('▶ Propagating names into make_scenarios denormalized columns…')
  const [orgsR, teamsR, foldersR, scenariosR] = await Promise.all([
    supa.from('make_organizations').select('id, org_name'),
    supa.from('make_teams').select('id, team_name'),
    supa.from('make_folders').select('id, folder_name'),
    supa.from('make_scenarios').select('id, org_id, team_id, folder_id, org_name, team_name, folder_name'),
  ])
  const orgMap = new Map((orgsR.data ?? []).map((o) => [o.id, o.org_name]))
  const teamMap = new Map((teamsR.data ?? []).map((t) => [t.id, t.team_name]))
  const folderMap = new Map((foldersR.data ?? []).map((f) => [f.id, f.folder_name]))

  let scenariosUpdated = 0
  for (const s of scenariosR.data ?? []) {
    const newOrg = s.org_id ? (orgMap.get(s.org_id) ?? null) : null
    const newTeam = s.team_id ? (teamMap.get(s.team_id) ?? null) : null
    const newFolder = s.folder_id ? (folderMap.get(s.folder_id) ?? null) : null
    if (newOrg !== s.org_name || newTeam !== s.team_name || newFolder !== s.folder_name) {
      const { error } = await supa
        .from('make_scenarios')
        .update({ org_name: newOrg, team_name: newTeam, folder_name: newFolder })
        .eq('id', s.id)
      if (!error) scenariosUpdated++
    }
  }

  console.info(`▶ Done. Teams: ${teamsOk}, Folders: ${foldersOk}, Scenarios touched: ${scenariosUpdated}`)
}

main().catch((err) => {
  console.error('refresh-meta fatal:', err)
  process.exit(1)
})
