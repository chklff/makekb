// Server-side helper to fetch the current Supabase user.
// Always uses getUser() (verifies with the server) not getSession() (just decodes the cookie).

import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export async function getUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user ?? null
}
