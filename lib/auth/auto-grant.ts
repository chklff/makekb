// Auto-grant new sign-ins to the default org based on env allowlists.
//
// Called from the OAuth callback once a session has been established. Inserts a
// `user_org_memberships` row if the user has no existing membership AND their email
// matches one of the configured rules.
//
// Rules (first match wins, no overwrites of existing memberships):
//   1. Email in AUTO_GRANT_ADMIN_EMAILS    → admin   (works for ANY domain — personal Gmails are fine)
//   2. Email domain in AUTO_GRANT_DOMAINS  → member  (catchall for company-domain folks)
//   3. (otherwise) no grant, user sees "No org access yet"
//
// Target org is MAKE_DEFAULT_ORG_ID — same one the ingestion pipeline writes to.

import '@/lib/utils/assert-server'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/utils/logger'

interface MaybeGrantResult {
  granted: boolean
  role?: 'admin' | 'member'
  reason?: string
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export async function maybeAutoGrantMembership(args: {
  userId: string
  email: string | null | undefined
}): Promise<MaybeGrantResult> {
  if (!args.email) return { granted: false, reason: 'no_email' }

  const email = args.email.toLowerCase()
  const domain = email.split('@')[1] ?? ''
  const adminEmails = splitList(process.env.AUTO_GRANT_ADMIN_EMAILS)
  const memberDomains = splitList(process.env.AUTO_GRANT_DOMAINS)
  const orgIdRaw = process.env.MAKE_DEFAULT_ORG_ID

  if (!orgIdRaw) return { granted: false, reason: 'MAKE_DEFAULT_ORG_ID_not_configured' }
  if (adminEmails.length === 0 && memberDomains.length === 0) {
    return { granted: false, reason: 'no_allowlist_configured' }
  }

  let role: 'admin' | 'member' | null = null
  if (adminEmails.includes(email)) role = 'admin'
  else if (memberDomains.includes(domain)) role = 'member'
  if (!role) return { granted: false, reason: 'email_not_on_allowlist' }

  // Service-role client — bypasses RLS so we can read/write memberships.
  const supa = createServiceClient()

  // Don't overwrite existing access (e.g. someone scripted them to a different role earlier).
  const { data: existing } = await supa
    .from('user_org_memberships')
    .select('user_id')
    .eq('user_id', args.userId)
    .limit(1)
  if (existing && existing.length > 0) {
    return { granted: false, reason: 'already_has_membership' }
  }

  // Find the make_organizations row by make_org_id. Don't create — the org needs to exist
  // (it gets created on first ingest). If missing, log and skip.
  const { data: org } = await supa
    .from('make_organizations')
    .select('id')
    .eq('make_org_id', String(orgIdRaw))
    .maybeSingle()
  if (!org) {
    logger.warn('auto-grant: target org not found in DB; skipping', { make_org_id: orgIdRaw })
    return { granted: false, reason: 'org_row_missing' }
  }

  const { error } = await supa
    .from('user_org_memberships')
    .insert({ user_id: args.userId, org_id: org.id, role })
  if (error) {
    logger.error('auto-grant insert failed', { user_id: args.userId, error: error.message })
    return { granted: false, reason: `insert_failed: ${error.message}` }
  }

  logger.info('auto-granted membership on first sign-in', {
    user_id: args.userId,
    email,
    role,
    make_org_id: orgIdRaw,
  })
  return { granted: true, role }
}
