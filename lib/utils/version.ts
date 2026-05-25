// Single source of truth for the app version surfaced to users.
// Reads from package.json so we only bump in one place on each release.
// `with { type: 'json' }` is the ESM import-assertion syntax; Next.js supports it.

import pkg from '@/package.json' with { type: 'json' }

export const APP_VERSION: string = pkg.version

/**
 * Returns the URL the sidebar version label should link to.
 * - `NEXT_PUBLIC_CHANGELOG_URL` set → link to that external URL (opens in new tab)
 * - unset → link to the built-in `/changelog` page (renders CHANGELOG.md from repo root)
 */
export function changelogUrl(): { href: string; external: boolean } {
  const env = process.env.NEXT_PUBLIC_CHANGELOG_URL?.trim()
  if (env) return { href: env, external: true }
  return { href: '/changelog', external: false }
}
