import { env } from '../env.js'
import { accessFor } from '../entitlements.js'
import { equal } from './crypto.js'
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, resolveSession } from './sessions.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function allowedOrigins() {
  return new Set([env.publicOrigin, ...env.corsOrigins].filter(Boolean))
}

export function attachSession(request) {
  const token = request.cookies?.[SESSION_COOKIE]
  if (!token) return null
  const session = resolveSession(token, { userAgent: request.headers['user-agent'] })
  request.session = session
  return session
}

export function checkOrigin(request) {
  if (SAFE_METHODS.has(request.method)) return true
  const origin = request.headers.origin
  if (!origin) return false
  return allowedOrigins().has(origin)
}

export function checkCsrf(request) {
  if (SAFE_METHODS.has(request.method)) return true
  const session = request.session
  if (!session) return false
  const header = request.headers[CSRF_HEADER]
  const cookie = request.cookies?.[CSRF_COOKIE]
  if (typeof header !== 'string' || typeof cookie !== 'string') return false
  return equal(header, session.csrf) && equal(cookie, session.csrf)
}

export function requireSession(request, reply) {
  const session = request.session ?? attachSession(request)
  if (!session) {
    reply.code(401).send({ code: 'unauthenticated', message: 'Sign in with Discord first.' })
    return null
  }
  return session
}

export async function requireAccess(request, reply) {
  const session = requireSession(request, reply)
  if (!session) return null

  const access = await accessFor(session.userId)
  if (!access.allowed) {
    reply.code(403).send({
      code: access.reason,
      message: 'This account does not currently hold the access role.',
    })
    return null
  }
  return { session, access }
}
