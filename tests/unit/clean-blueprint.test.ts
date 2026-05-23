import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanBlueprint, extractApps, firstModuleApp } from '@/lib/make/clean-blueprint'
import type { MakeBlueprint, MakeModule } from '@/lib/make/types'

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/blueprint-router-onerror.json'), 'utf8'),
) as MakeBlueprint

describe('cleanBlueprint', () => {
  const cleaned = cleanBlueprint(fixture)

  it('keeps blueprint name', () => {
    expect(cleaned.name).toBe(fixture.name)
  })

  it('keeps scenario metadata but drops top-level designer', () => {
    expect(cleaned.metadata?.scenario).toEqual(fixture.metadata?.scenario)
    expect(cleaned.metadata?.instant).toBe(false)
    expect(cleaned.metadata?.version).toBe(1)
    expect((cleaned.metadata as Record<string, unknown>).designer).toBeUndefined()
  })

  it('strips designer + parameters metadata from every module', () => {
    function noDesigner(modules: MakeModule[]) {
      for (const m of modules) {
        expect((m.metadata as Record<string, unknown> | undefined)?.designer).toBeUndefined()
        expect((m.metadata as Record<string, unknown> | undefined)?.parameters).toBeUndefined()
        if (Array.isArray(m.onerror)) noDesigner(m.onerror)
        if (Array.isArray(m.routes)) for (const r of m.routes) noDesigner(r.flow)
      }
    }
    noDesigner(cleaned.flow)
  })

  it('keeps metadata.restore when non-empty (it disambiguates user intent)', () => {
    const trigger = cleaned.flow[0]
    expect(trigger?.metadata?.restore).toEqual({ watchPattern: { label: 'Updated' } })

    const router = cleaned.flow[1]
    const wonBranch = router?.routes?.[0]?.flow?.[0]
    expect(wonBranch?.metadata?.restore).toEqual({ pixelId: { label: 'Production Pixel' } })
  })

  it('omits metadata entirely when restore is missing or empty', () => {
    const router = cleaned.flow[1]
    expect(router?.metadata).toBeUndefined()
  })

  it('recurses into routes and preserves their flow', () => {
    const router = cleaned.flow[1]
    expect(router?.routes?.length).toBe(2)
    expect(router?.routes?.[0]?.flow?.length).toBe(1)
    expect(router?.routes?.[1]?.flow?.[0]?.module).toBe('slack:postMessage')
  })

  it('recurses into onerror handlers', () => {
    const wonBranch = cleaned.flow[1]?.routes?.[0]?.flow?.[0]
    expect(Array.isArray(wonBranch?.onerror)).toBe(true)
    expect(wonBranch?.onerror?.[0]?.module).toBe('builtin:Resume')
  })

  it('keeps filters as-is', () => {
    const wonBranch = cleaned.flow[1]?.routes?.[0]?.flow?.[0]
    expect(wonBranch?.filter).toEqual({ name: 'Won deals', conditions: [] })
  })
})

describe('extractApps', () => {
  it('returns unique app keys (sorted), recursing through routes + onerror', () => {
    const apps = extractApps(fixture)
    expect(apps).toEqual(['facebook-conversion-leads', 'hubspotcrm', 'slack'])
  })

  it("excludes 'builtin'", () => {
    expect(extractApps(fixture)).not.toContain('builtin')
  })
})

describe('firstModuleApp', () => {
  it('returns the app key of the first module', () => {
    expect(firstModuleApp(fixture)).toBe('hubspotcrm')
  })
})
