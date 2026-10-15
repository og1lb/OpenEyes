import { request } from './api.js'
import { load, save } from './storage.js'

const QUEUE_KEY = 'early-access-queue'

export function localQueue() {
  return load(QUEUE_KEY, [])
}

function makeRef() {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `IS-${stamp}-${rand}`
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim())
}

export async function submitEarlyAccess(email, settings = {}) {
  const body = {
    email: String(email || '').trim().toLowerCase(),
    submittedAt: new Date().toISOString(),
  }

  try {
    const res = await request('/api/early-access', { body, settings })
    return { delivered: true, reference: res?.id || res?.reference || makeRef() }
  } catch (err) {
    const unavailable =
      err.code === 'network' ||
      err.code === 'timeout' ||
      [404, 405, 500, 502, 503, 504].includes(err.status)
    if (!unavailable) throw err

    const reference = makeRef()
    const queue = localQueue()
    queue.unshift({ ...body, reference })
    save(QUEUE_KEY, queue.slice(0, 200))
    return { delivered: false, reference, queued: queue.length }
  }
}
