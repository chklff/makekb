// SERVICE-ROLE Supabase client. Bypasses RLS. SERVER-SIDE ONLY.
// Importing this from any client component will fail the build via `server-only`.
//
// Used by: Edge Function ingestion pipeline, server-side cron tasks, admin-only routes.
// Never by: any Client Component, anything that touches `use client`.

import '@/lib/utils/assert-server'
import { createClient as createSupaClient } from '@supabase/supabase-js'
import type { Database } from './types'

export function createServiceClient() {
  return createSupaClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
