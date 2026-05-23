import { createHash } from 'node:crypto'

/**
 * Canonical JSON serialization — same input shape always produces the same string.
 * Critical for `blueprint_hash` dedup: if Make returns the same blueprint with keys
 * in different order, we still want to recognize it as unchanged.
 *
 * Rules:
 *  - Object keys sorted lexicographically (recursively)
 *  - Arrays preserve order (order is semantic in Make blueprints — flow steps run in order!)
 *  - Strings JSON.stringify'd (handles unicode + escapes)
 *  - undefined → null (matches JSON.stringify behaviour)
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k])).join(',') + '}'
  }
  // function, symbol — treated as undefined
  return 'null'
}

/** SHA-256 hash of the canonical JSON form of `value`. Hex-encoded. */
export function sha256OfJson(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')
}
