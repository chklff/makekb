// Google OAuth → Supabase Auth → here.
// Supabase sends the user back to this URL with ?code=... after they authorize.
// We exchange the code for a session cookie and redirect into the app.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { maybeAutoGrantMembership } from '@/lib/auth/auto-grant'
import { logger } from '@/lib/utils/logger'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/chat'
  const errorDescription = url.searchParams.get('error_description')

  if (errorDescription) {
    // Forward OAuth provider errors back to the sign-in page so the UI can show them.
    const back = new URL('/sign-in', url.origin)
    back.searchParams.set('error', errorDescription)
    return NextResponse.redirect(back)
  }

  if (!code) {
    const back = new URL('/sign-in', url.origin)
    back.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(back)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const back = new URL('/sign-in', url.origin)
    back.searchParams.set('error', error.message)
    return NextResponse.redirect(back)
  }

  // First-sign-in auto-grant. Best-effort: never blocks the redirect.
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await maybeAutoGrantMembership({ userId: user.id, email: user.email })
    }
  } catch (err) {
    logger.warn('auto-grant attempt failed; user will see "No org access yet"', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Safety: only allow same-origin redirects in `next` to prevent open-redirect abuse.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/chat'
  return NextResponse.redirect(new URL(safeNext, url.origin))
}
