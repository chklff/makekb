// Per-user, per-route sliding-window rate limit.
//
// Storage: in-memory Map. Caveats:
//   - Doesn't survive process restart (fine — rate limits don't need to persist).
//   - Doesn't share state across Vercel serverless workers — each region/instance
//     enforces its own limit. For 5-10 concurrent users on a single-region deploy
//     this is fine. If you scale past that, swap the Map for Upstash Redis
//     (the API surface here doesn't change).
//
// Usage from a route handler:
//
//   const rl = await enforceRateLimit({ key: 'chat:' + user.id, limit: 30, windowMs: 60_000 })
//   if (rl) return rl  // 429 response with Retry-After header
//
// Returning `rl` short-circuits the request when over budget; nothing else needed.

import 'server-only'

interface Bucket {
  // Sorted oldest → newest timestamps (ms epoch).
  hits: number[]
}

const BUCKETS: Map<string, Bucket> = new Map()

// Janitor — every 5 min, drop fully-expired buckets so we don't grow unbounded
// in a long-running process.
let janitorStarted = false
function startJanitor() {
  if (janitorStarted) return
  janitorStarted = true
  setInterval(
    () => {
      const now = Date.now()
      for (const [k, b] of BUCKETS) {
        // 10 min unused → drop. The longest window we ever set is 60s; 10× safety.
        if (b.hits.length === 0 || b.hits[b.hits.length - 1]! + 600_000 < now) {
          BUCKETS.delete(k)
        }
      }
    },
    5 * 60_000,
  ).unref?.()
}

export interface RateLimitOpts {
  key: string
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetMs: number
}

/** Pure check — doesn't return a Response. Useful when you want to act on the result yourself. */
export function checkRateLimit(opts: RateLimitOpts): RateLimitResult {
  startJanitor()
  const now = Date.now()
  const cutoff = now - opts.windowMs
  let bucket = BUCKETS.get(opts.key)
  if (!bucket) {
    bucket = { hits: [] }
    BUCKETS.set(opts.key, bucket)
  }
  // Drop expired hits in place.
  while (bucket.hits.length > 0 && bucket.hits[0]! < cutoff) bucket.hits.shift()

  if (bucket.hits.length >= opts.limit) {
    const oldest = bucket.hits[0]!
    return {
      ok: false,
      remaining: 0,
      resetMs: Math.max(0, oldest + opts.windowMs - now),
    }
  }
  bucket.hits.push(now)
  return {
    ok: true,
    remaining: opts.limit - bucket.hits.length,
    resetMs: opts.windowMs,
  }
}

/**
 * Convenience: returns a 429 Response when over limit, or null when under.
 * Route handlers can pattern-match:
 *
 *   const limited = enforceRateLimit({ key, limit: 30, windowMs: 60_000 })
 *   if (limited) return limited
 */
export function enforceRateLimit(opts: RateLimitOpts): Response | null {
  const r = checkRateLimit(opts)
  if (r.ok) return null
  const retrySec = Math.ceil(r.resetMs / 1000)
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      message: `Too many requests. Try again in ${retrySec}s.`,
      retry_after_seconds: retrySec,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(retrySec),
        'x-ratelimit-limit': String(opts.limit),
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000 + retrySec)),
      },
    },
  )
}
