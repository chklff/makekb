// Runs before every request that matches the matcher below.
// Two jobs:
//   1. Refresh the Supabase auth cookie on every request (otherwise it expires after ~1h
//      of inactivity and the user gets logged out at the next click).
//   2. Redirect unauthenticated users away from protected routes to /sign-in,
//      preserving the original URL so we can send them back after sign-in.

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

const PROTECTED_PREFIXES = ['/chat', '/browse', '/scenarios', '/patterns']

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  // CRITICAL: use getUser() not getSession() — getUser() asks the Supabase server
  // to verify the JWT, getSession() just decodes the local cookie (forgeable).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = req.nextUrl.pathname
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

  if (!user && isProtected) {
    const url = req.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  // Already signed in but visiting sign-in → bounce to /chat
  if (user && path === '/sign-in') {
    const url = req.nextUrl.clone()
    url.pathname = '/chat'
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match everything except static assets, image optimization, favicon, and the public
     * health endpoint. The middleware still runs on /api/* so we can keep route-level
     * auth checks lean (we still call requireUser() in each route, but we can skip
     * cookie refresh logic there).
     */
    '/((?!_next/static|_next/image|favicon.ico|api/health).*)',
  ],
}
