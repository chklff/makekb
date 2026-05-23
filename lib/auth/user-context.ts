// Shared "who is this user and what can they see?" lookup for Server Components.
//
// One round-trip:
//   - the authenticated user (Supabase Auth)
//   - their org memberships (with role)
//   - top-line counts (scenarios + patterns) — RLS-scoped, so what the user actually sees
//
// Pages call this once at the top and pass the result to their layout/children.

import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export interface AppUserContext {
  user: User
  memberships: Array<{ org_id: string; role: string; org_name: string | null }>
  isAdmin: boolean
  counts: {
    scenarios: number
    patterns: number
  }
}

/** Returns null if no signed-in user. Server Components should redirect when this is null. */
export async function getAppUserContext(): Promise<AppUserContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Memberships — joined to get org_name for the UI.
  const { data: memberships } = await supabase
    .from('user_org_memberships')
    .select('org_id, role, make_organizations(org_name)')
    .eq('user_id', user.id)
    .returns<
      Array<{ org_id: string; role: string; make_organizations: { org_name: string } | null }>
    >()

  const flatMemberships = (memberships ?? []).map((m) => ({
    org_id: m.org_id,
    role: m.role,
    org_name: m.make_organizations?.org_name ?? null,
  }))

  const isAdmin = flatMemberships.some((m) => m.role === 'owner' || m.role === 'admin')

  // Counts — RLS-scoped, so they reflect only orgs this user can see.
  const [scenariosRes, patternsRes] = await Promise.all([
    supabase.from('make_scenarios').select('id', { count: 'exact', head: true }),
    supabase.from('scenario_patterns').select('id', { count: 'exact', head: true }),
  ])

  return {
    user,
    memberships: flatMemberships,
    isAdmin,
    counts: {
      scenarios: scenariosRes.count ?? 0,
      patterns: patternsRes.count ?? 0,
    },
  }
}
