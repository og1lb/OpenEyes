const TIMEOUT_MS = 10000
const MAX_BYTES = 1024 * 512

async function getJson(base, path) {
  const url = `${base.replace(/\/+$/, '')}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'openeyes/0.1' },
    })
    if (!res.ok) throw new Error(`${url} answered ${res.status}`)
    const text = await res.text()
    if (text.length > MAX_BYTES) throw new Error(`${url} answered with an oversized body`)
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

export function createChainClient(chain) {
  const endpoints = [chain.esploraUrl, chain.esploraFallbackUrl].filter(Boolean)
  if (endpoints.length === 0) throw new Error('no chain endpoint configured')

  async function call(path) {
    let lastError
    for (const base of endpoints) {
      try {
        return await getJson(base, path)
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }

  return {
    async tipHeight() {
      const value = await call('/blocks/tip/height')
      const height = Number(value)
      if (!Number.isInteger(height) || height <= 0) throw new Error('chain tip is not a height')
      return height
    },

    async outputsFor(address) {
      const rows = await call(`/address/${encodeURIComponent(address)}/utxo`)
      if (!Array.isArray(rows)) throw new Error('utxo endpoint did not answer with a list')
      return rows
        .filter(
          (row) =>
            row &&
            typeof row.txid === 'string' &&
            /^[0-9a-f]{64}$/.test(row.txid) &&
            Number.isInteger(row.vout) &&
            row.vout >= 0 &&
            Number.isInteger(row.value) &&
            row.value > 0,
        )
        .map((row) => ({
          txid: row.txid,
          vout: row.vout,
          units: row.value,
          confirmed: Boolean(row.status?.confirmed),
          blockHeight: Number.isInteger(row.status?.block_height) ? row.status.block_height : null,
        }))
    },
  }
}
