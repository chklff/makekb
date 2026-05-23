#!/usr/bin/env -S tsx
/**
 * Bootstrap admin membership for a Supabase auth user.
 *
 * Usage:
 *   pnpm tsx scripts/grant-user-org-access.ts \
 *     --email=admin@company.com \
 *     --make_org_id=12345 \
 *     [--role=admin]   # default 'admin' (also: 'owner' | 'member' | 'viewer')
 *
 * Run this once after the user has signed in for the first time (so their row exists
 * in auth.users) and after the corresponding make_organizations row exists.
 */
import './_load-env'
import { createClient } from '@supabase/supabase-js'

interface Args {
  email: string
  makeOrgId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { role: 'admin' }
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/)
    if (!m) continue
    const [, k, v] = m
    if (k === 'email') out.email = v
    else if (k === 'make_org_id') out.makeOrgId = v
    else if (k === 'role') out.role = v as Args['role']
  }
  if (!out.email || !out.makeOrgId) {
    throw new Error('Required: --email=<user> --make_org_id=<id>')
  }
  return out as Args
}

async function main() {
  const args = parseArgs(process.argv)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local')
  }
  const supa = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Look up auth.users by email (via admin API)
  const { data: usersPage, error: lookupErr } = await supa.auth.admin.listUsers()
  if (lookupErr) throw lookupErr
  const user = usersPage.users.find((u) => u.email?.toLowerCase() === args.email.toLowerCase())
  if (!user) {
    throw new Error(
      `No auth user with email ${args.email}. Have them sign in once first (Google OAuth) so their row is created.`,
    )
  }
  console.info(`▶ Found auth user ${user.id} for ${args.email}`)

  // 2. Look up the make_organizations row by make_org_id; create it if missing
  let { data: org } = await supa
    .from('make_organizations')
    .select('id, org_name')
    .eq('make_org_id', args.makeOrgId)
    .maybeSingle()

  if (!org) {
    const { data, error } = await supa
      .from('make_organizations')
      .insert({ make_org_id: args.makeOrgId, org_name: `Org ${args.makeOrgId}` })
      .select('id, org_name')
      .single()
    if (error) throw error
    org = data
    console.info(`▶ Created make_organizations row (${org.id}) for make_org_id=${args.makeOrgId}`)
  } else {
    console.info(`▶ Found make_organizations row (${org.id}) for make_org_id=${args.makeOrgId}`)
  }

  // 3. Upsert membership
  const { error: upErr } = await supa
    .from('user_org_memberships')
    .upsert(
      { user_id: user.id, org_id: org.id, role: args.role },
      { onConflict: 'user_id,org_id' },
    )
  if (upErr) throw upErr

  console.info(
    `▶ Granted role="${args.role}" to ${args.email} on org ${args.makeOrgId} (row id ${org.id}).`,
  )
}

main().catch((err) => {
  console.error('Grant fatal:', err)
  process.exit(1)
})
