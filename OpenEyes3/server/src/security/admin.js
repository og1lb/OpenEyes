import { audit, db } from '../db.js'
import { isAdminId, isOwnerId } from '../entitlements.js'
import { attachSession, checkCsrf, checkOrigin } from './guards.js'

export function adminConfigured() { return true }
export function secondFactorRequired() { return false }
export function isOwner(userId) { return isOwnerId(userId) }
export function isAdmin(userId) { return isAdminId(userId) }
export function ipAllowed() { return true }
export function adminUntil(session) { return session ? session.absoluteExpiresAt : null }
export function adminState(request) {
  const session = request.session ?? attachSession(request)
  if (!session || !isAdminId(session.userId)) return null
  return { session, until: adminUntil(session) }
}
export function requireOwner(request, reply) {
  if (!checkOrigin(request)) { reply.code(403).send({ code: 'bad_origin', message: 'Blocked.' }); return null }
  const state = adminState(request)
  if (!state || !isOwnerId(state.session.userId)) { reply.code(403).send({ code: 'forbidden', message: 'Owner access required.' }); return null }
  if (!checkCsrf(request)) { reply.code(403).send({ code: 'bad_csrf', message: 'Blocked.' }); return null }
  return state
}
export function requireAdmin(request, reply) {
  if (!checkOrigin(request)) { reply.code(403).send({ code: 'bad_origin', message: 'Blocked.' }); return null }
  const state = adminState(request)
  if (!state) { reply.code(403).send({ code: 'forbidden', message: 'Admin access required.' }); return null }
  if (!checkCsrf(request)) { reply.code(403).send({ code: 'bad_csrf', message: 'Blocked.' }); return null }
  return state
}
export function elevate(request) { return adminState(request) ? { ok: true, until: adminUntil(request.session) } : { ok: false, reason: 'forbidden' } }
export function dropElevation() {}
