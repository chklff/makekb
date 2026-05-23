// The surgical cleaner. See /docs/archive/AI-Architecture.md §4.1 and /docs/archive/Build-Brief.md §8.
// Strips display-only metadata + dropdown-option bloat, keeps the configured intent.
//
// Three rules:
//   - `metadata.designer`   → STRIP (pure x/y canvas coords)
//   - `metadata.parameters` → STRIP (the enum dropdown options — bloats blueprints)
//   - `metadata.restore`    → KEEP   (human labels for the SELECTED values)
//
// Plus always keep: mapper, filter, routes[].flow (recursive), onerror[] (recursive),
// configured parameters, scenario-level operational settings.

import type { MakeBlueprint, MakeModule, MakeRoute } from './types'

export function cleanModule(mod: MakeModule): MakeModule {
  const cleaned: MakeModule = {
    id: mod.id,
    module: mod.module,
    version: mod.version,
    parameters: mod.parameters,
    mapper: mod.mapper,
  }

  if (mod.filter !== undefined) cleaned.filter = mod.filter

  if (mod.metadata?.restore && Object.keys(mod.metadata.restore).length > 0) {
    cleaned.metadata = { restore: mod.metadata.restore }
  }

  if (Array.isArray(mod.onerror)) {
    cleaned.onerror = mod.onerror.map(cleanModule)
  }

  if (Array.isArray(mod.routes)) {
    cleaned.routes = mod.routes.map(
      (r: MakeRoute): MakeRoute => ({
        ...r,
        flow: Array.isArray(r.flow) ? r.flow.map(cleanModule) : [],
      }),
    )
  }

  return cleaned
}

export function cleanBlueprint(bp: MakeBlueprint): MakeBlueprint {
  return {
    name: bp.name,
    flow: Array.isArray(bp.flow) ? bp.flow.map(cleanModule) : [],
    metadata: {
      instant: bp.metadata?.instant,
      version: bp.metadata?.version,
      scenario: bp.metadata?.scenario,
    },
  }
}

/**
 * Extract every app key from a blueprint (recursive into routes + onerror).
 * Used by ingest-worker to verify the LLM's `apps_involved` list against ground truth.
 */
export function extractApps(bp: MakeBlueprint): string[] {
  const apps = new Set<string>()
  function walk(modules: MakeModule[] | undefined) {
    if (!Array.isArray(modules)) return
    for (const m of modules) {
      const app = typeof m.module === 'string' ? m.module.split(':')[0] : null
      if (app && app !== 'builtin') apps.add(app)
      if (Array.isArray(m.onerror)) walk(m.onerror)
      if (Array.isArray(m.routes)) {
        for (const r of m.routes) walk(r.flow)
      }
    }
  }
  walk(bp.flow)
  return Array.from(apps).sort()
}

/** Returns the first module's app key (or null), used to derive trigger_app fallback. */
export function firstModuleApp(bp: MakeBlueprint): string | null {
  const first = bp.flow?.[0]
  if (!first || typeof first.module !== 'string') return null
  const app = first.module.split(':')[0]
  return app && app !== 'builtin' ? app : null
}
