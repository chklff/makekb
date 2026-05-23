// Server-side helper used by /api/ingest/* routes.
// Requires a signed-in user AND that user must have role 'owner' or 'admin' in at least one org.

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireUser, UnauthorizedResponse } from './require-session'

export class ForbiddenResponse extends Error {
  readonly response: NextResponse
  constructor(reason = 'forbidden_not_admin') {
    super(reason)
    this.response = NextResponse.json({ error: reason }, { status: 403 })
  }
}

/** Returns the user if they're a signed-in admin/owner, otherwise throws. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('user_org_memberships')
    .select('role')
    .eq('user_id', user.id)
    .returns<{ role: string }[]>()

  const isAdmin = (memberships ?? []).some(
    (m) => m.role === 'owner' || m.role === 'admin',
  )
  if (!isAdmin) throw new ForbiddenResponse('forbidden_not_admin')
  return user
}

/** Convenience wrapper for route handlers: returns either the user or a NextResponse to bail on. */
export async function adminGuard(): Promise<{ user: User } | { response: NextResponse }> {
  try {
    const user = await requireAdmin()
    return { user }
  } catch (e) {
    if (e instanceof UnauthorizedResponse) return { response: e.response }
    if (e instanceof ForbiddenResponse) return { response: e.response }
    throw e
  }
}
