// Drop-in replacement for `import 'server-only'`.
//
// Why not just use `server-only`? That package throws unconditionally at import time,
// which is fine inside Next.js (the bundler replaces the import with a build error
// for client components) but breaks in any other Node context — `tsx` scripts,
// vitest, anything that calls `lib/` code directly.
//
// This module runs a tiny runtime check instead: throws ONLY if `window` is defined
// (i.e. we're actually in a browser). In server contexts (Next.js server, Node scripts,
// Vitest with node env), it's a no-op. Same guarantee for the production app,
// no friction for scripts.

if (typeof window !== 'undefined') {
  throw new Error(
    'This module is server-only. Import it from a Server Component, Route Handler, or Node script — not from a Client Component.',
  )
}

export {}
