// GET /api/folders — list folders the signed-in admin can scope a re-sync to.
// Pulled from our own `make_folders` table (already populated by past ingests),
// not the Make API — no extra latency, no rate-limit risk on the folder picker.

import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/auth/require-admin'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const guard = await adminGuard()
  if ('response' in guard) return guard.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('make_folders')
    .select('make_folder_id, folder_name, team_id, team:make_teams(team_name)')
    .order('folder_name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten — the joined team_name is nested by Supabase by default.
  const folders = (data ?? []).map((row) => {
    const team = (row as { team?: { team_name?: string | null } | null }).team
    return {
      make_folder_id: (row as { make_folder_id: string }).make_folder_id,
      folder_name: (row as { folder_name: string | null }).folder_name,
      team_name: team?.team_name ?? null,
    }
  })

  return NextResponse.json({ folders })
}
