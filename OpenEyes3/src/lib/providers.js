import { runLookup } from './session.js'

const providers = new Map()

export function registerProvider(moduleId, fn) {
  providers.set(moduleId, fn)
}

export function hasProvider(moduleId) {
  return providers.has(moduleId)
}

export async function runModule({ mod, values, signal }) {
  const startedAt = Date.now()
  const provider = providers.get(mod.id)
  const result = provider ? await provider({ mod, values, signal }) : await runLookup(mod.id, values, signal)

  const blocks = result?.blocks ?? result ?? {}
  return {
    blocks,
    raw: result?.raw ?? result,
    quota: result?.quota ?? null,
    meta: {
      ...(result?.meta || {}),
      source: provider ? 'provider' : result?.meta?.source || 'live',
      startedAt,
      durationMs: Date.now() - startedAt,
    },
  }
}
