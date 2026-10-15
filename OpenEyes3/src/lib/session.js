const CSRF_COOKIE = 'openeyes_csrf'
const CSRF_HEADER = 'x-openeyes-csrf'

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/+$/, '')
const CROSS_ORIGIN = Boolean(API_ORIGIN)
const TOKEN_KEY = 'openeyes:token'

export function apiUrl(path) {
  return CROSS_ORIGIN ? `${API_ORIGIN}${path}` : path
}

export function readToken() {
  if (!CROSS_ORIGIN) return ''
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private windows and blocked site data. The session then lasts one page.
  }
}

/**
 * On a separate API domain the worker cannot set a cookie we would be allowed
 * to read, so it sends back a one-time code in the fragment. Swap it for a
 * token, then scrub it out of the URL and the history entry.
 */
export async function consumeHandoff() {
  if (!CROSS_ORIGIN || typeof window === 'undefined') return false

  const match = window.location.hash.match(/(?:^|[#&])auth=([^&]+)/)
  if (!match) return false

  const code = decodeURIComponent(match[1])
  const cleanHash = window.location.hash.replace(/(?:^|[#&])auth=[^&]*/, '').replace(/^#?&?/, '')
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search + (cleanHash ? `#${cleanHash}` : ''),
  )

  try {
    const res = await call('/api/auth/exchange', { method: 'POST', body: { code }, anonymous: true })
    if (res?.token) {
      writeToken(res.token)
      return true
    }
  } catch {
    // A spent or expired code just means we stay signed out.
  }
  return false
}

export class SessionError extends Error {
  constructor(message, { status = 0, code = 'error' } = {}) {
    super(message)
    this.name = 'SessionError'
    this.status = status
    this.code = code
  }
}

function csrfToken() {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${CSRF_COOKIE}=`))
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : ''
}

export async function call(path, { method = 'GET', body, signal, anonymous = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && method !== 'HEAD') headers[CSRF_HEADER] = csrfToken()

  if (!anonymous) {
    const token = readToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      signal,
      credentials: CROSS_ORIGIN ? 'include' : 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw new SessionError('Cancelled', { code: 'aborted' })
    throw new SessionError('The server did not answer.', { code: 'network' })
  }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new SessionError(payload?.message || `Answered ${response.status}`, {
      status: response.status,
      code: payload?.code || 'http_error',
    })
  }

  return payload
}

function startParams(returnTo) {
  const params = new URLSearchParams({ returnTo })
  if (CROSS_ORIGIN && typeof window !== 'undefined') params.set('origin', window.location.origin)
  return params
}

export function loginUrl(returnTo = '/panel') {
  return apiUrl(`/api/auth/discord/start?${startParams(returnTo)}`)
}

export async function runLookup(moduleId, values, signal) {
  const hasFile = Object.values(values).some((v) => typeof File !== 'undefined' && v instanceof File)
  const headers = {}
  headers[CSRF_HEADER] = csrfToken()
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let body
  if (hasFile) {
    body = new FormData()
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === null || value === undefined) continue
      if (Array.isArray(value)) body.append(key, value.join(','))
      else body.append(key, value)
    }
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(values)
  }

  let response
  try {
    response = await fetch(apiUrl(`/api/run/${moduleId}`), {
      method: 'POST',
      headers,
      body,
      signal,
      credentials: CROSS_ORIGIN ? 'include' : 'same-origin',
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw new SessionError('Cancelled', { code: 'aborted' })
    throw new SessionError('The server did not answer.', { code: 'network' })
  }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }
  if (!response.ok) {
    throw new SessionError(payload?.message || `Answered ${response.status}`, {
      status: response.status,
      code: payload?.code || 'http_error',
    })
  }
  return payload
}

export function fetchMe(signal) {
  return call('/api/me', { signal })
}

export function refreshRole() {
  return call('/api/account/role/refresh', { method: 'POST' })
}

export async function logout() {
  try {
    return await call('/api/auth/logout', { method: 'POST' })
  } finally {
    writeToken('')
  }
}

export function revokeSessions() {
  return call('/api/account/sessions/revoke', { method: 'POST' })
}

export function fetchPlans(signal) {
  return call('/api/billing/plans', { signal })
}

export function openInvoice(planId, asset) {
  return call('/api/billing/invoice', { method: 'POST', body: { planId, asset } })
}

export function readInvoice(id, signal) {
  return call(`/api/billing/invoice/${encodeURIComponent(id)}`, { signal })
}

export const ASSET_LABELS = { btc: 'Bitcoin', ltc: 'Litecoin' }
export const ASSET_TICKERS = { btc: 'BTC', ltc: 'LTC' }
