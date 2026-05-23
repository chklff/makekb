// In a Route Handler, call `await requireUser()` at the top. Returns the user or
// throws a NextResponse 401 that the framework will surface.

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { getUser } from './get-session'

export class UnauthorizedResponse extends Error {
  readonly response: NextResponse
  constructor() {
    super('Unauthorized')
    this.response = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
}

export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) throw new UnauthorizedResponse()
  return user
}
