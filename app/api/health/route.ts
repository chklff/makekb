import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '0.1.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    ts: new Date().toISOString(),
  })
}
