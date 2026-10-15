import { env } from '../env.js'

const cache = new Map()

function fixedRate(asset) {
  const raw = (process.env[`${asset.toUpperCase()}_USD_RATE`] ?? '').trim()
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

async function fetchRates() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(env.rateUrl, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'openeyes/0.1' },
    })
    if (!res.ok) throw new Error(`rate source answered ${res.status}`)
    const body = await res.json()
    const out = {}
    for (const asset of ['btc', 'ltc']) {
      const value = Number(body?.[asset])
      if (Number.isFinite(value) && value > 0) out[asset] = value
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

export async function usdRate(asset) {
  const fixed = fixedRate(asset)
  if (fixed !== null) return fixed

  const cached = cache.get(asset)
  if (cached && cached.until > Date.now()) return cached.value
  if (!env.rateUrl) return null

  let rates
  try {
    rates = await fetchRates()
  } catch {
    return cached ? cached.value : null
  }

  const until = Date.now() + env.rateTtlSeconds * 1000
  for (const [key, value] of Object.entries(rates)) cache.set(key, { value, until })

  const value = rates[asset]
  return value ?? (cached ? cached.value : null)
}
