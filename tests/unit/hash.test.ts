import { describe, it, expect } from 'vitest'
import { canonicalize, sha256OfJson } from '@/lib/utils/hash'

describe('canonicalize', () => {
  it('produces the same string regardless of key order', () => {
    const a = { foo: 1, bar: { baz: 2, qux: 3 } }
    const b = { bar: { qux: 3, baz: 2 }, foo: 1 }
    expect(canonicalize(a)).toBe(canonicalize(b))
  })

  it('preserves array order', () => {
    expect(canonicalize([1, 2, 3])).toBe('[1,2,3]')
    expect(canonicalize([3, 2, 1])).toBe('[3,2,1]')
  })

  it('handles nulls, undefined, NaN, Infinity', () => {
    expect(canonicalize(null)).toBe('null')
    expect(canonicalize(undefined)).toBe('null')
    expect(canonicalize(NaN)).toBe('null')
    expect(canonicalize(Infinity)).toBe('null')
  })

  it('escapes strings via JSON.stringify', () => {
    expect(canonicalize('hello "world"')).toBe('"hello \\"world\\""')
  })
})

describe('sha256OfJson', () => {
  it('is deterministic', () => {
    const obj = { a: 1, b: [1, 2, 3], c: { nested: true } }
    expect(sha256OfJson(obj)).toBe(sha256OfJson(obj))
  })

  it('changes when content changes', () => {
    expect(sha256OfJson({ a: 1 })).not.toBe(sha256OfJson({ a: 2 }))
  })

  it('is same regardless of key order at any depth', () => {
    const a = { x: { foo: 1, bar: 2 }, y: 3 }
    const b = { y: 3, x: { bar: 2, foo: 1 } }
    expect(sha256OfJson(a)).toBe(sha256OfJson(b))
  })

  it('emits 64-char hex', () => {
    expect(sha256OfJson({ hello: 'world' })).toMatch(/^[0-9a-f]{64}$/)
  })
})
