export class ApiError extends Error {
  constructor(message, { status = 0, detail = null, code = 'error' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.code = code
  }
}

function joinUrl(base, path) {
  if (!base) return path
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export async function request(path, { body, settings = {}, signal, method = 'POST' } = {}) {
  const url = joinUrl(settings.apiBaseUrl || '', path)
  const controller = new AbortController()
  const timeoutMs = Number(settings.timeoutMs) || 30000
  const timer = setTimeout(() => controller.abort(new ApiError('Timed out', { code: 'timeout' })), timeoutMs)

  if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  const headers = {}
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (settings.apiToken) headers.Authorization = `Bearer ${settings.apiToken}`

  let response
  try {
    response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof ApiError) throw err
    if (err?.name === 'AbortError') throw new ApiError('Cancelled', { code: 'aborted' })
    throw new ApiError(`Cannot reach ${url}`, { code: 'network', detail: String(err?.message || err) })
  }
  clearTimeout(timer)

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.message || `Answered ${response.status}`, {
      status: response.status,
      detail: payload?.detail ?? payload?.raw ?? null,
      code: payload?.code || 'http_error',
    })
  }

  return payload
}

export async function ping(settings) {
  const started = performance.now()
  try {
    await request('/api/health', { settings, method: 'GET' })
    return { ok: true, ms: Math.round(performance.now() - started) }
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - started), error: err.message }
  }
}
