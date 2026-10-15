import { db, audit } from '../db.js'
import { env } from '../env.js'
import { equal, keyedHash, randomId, randomToken, sha256 } from './crypto.js'

export const SESSION_COOKIE = 'openeyes_session'
export const CSRF_COOKIE = 'openeyes_csrf'
export const CSRF_HEADER = 'x-openeyes-csrf'

const insertSession = db.prepare(`
  INSERT INTO sessions
    (id, user_id, token_hash, created_at, last_seen_at, idle_expires_at, absolute_expires_at, ip_address, ip_hash, ua_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const selectByHash = db.prepare(`
  SELECT s.id, s.user_id, s.created_at, s.idle_expires_at, s.absolute_expires_at, s.revoked_at, s.ua_hash,
         u.username, u.global_name, u.avatar, u.blocked_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ?
`)

const touchSession = db.prepare('UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?')
const revokeById = db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
const revokeByUser = db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
const deleteExpired = db.prepare('DELETE FROM sessions WHERE absolute_expires_at < ? OR revoked_at IS NOT NULL')

export function cookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
    signed: false,
  }
}

export function csrfCookieOptions(maxAgeSeconds) {
  return { ...cookieOptions(maxAgeSeconds), httpOnly: false }
}

export function csrfTokenFor(sessionId) {
  return keyedHash(sessionId, 'csrf').toString('base64url')
}

export function createSession(userId, { ip, userAgent }) {
  revokeByUser.run(Date.now(), userId)
  const token = randomToken(32)
  const id = randomId(16)
  const now = Date.now()
  insertSession.run(
    id,
    userId,
    sha256(token),
    now,
    now,
    now + env.sessionIdleSeconds * 1000,
    now + env.sessionAbsoluteSeconds * 1000,
    ip || null,
    ip ? keyedHash(ip, 'ip') : null,
    userAgent ? keyedHash(userAgent, 'ua') : null,
  )
  return { id, token, csrf: csrfTokenFor(id) }
}

export function resolveSession(token, { userAgent } = {}) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null
  const row = selectByHash.get(sha256(token))
  if (!row) return null

  const now = Date.now()
  if (row.revoked_at || row.blocked_at) return null
  if (now > row.idle_expires_at || now > row.absolute_expires_at) {
    revokeById.run(now, row.id)
    return null
  }
  if (row.ua_hash && userAgent && !equal(Buffer.from(row.ua_hash), keyedHash(userAgent, 'ua'))) {
    revokeById.run(now, row.id)
    audit('session.ua_mismatch', { actor: row.user_id, subject: row.id })
    return null
  }

  const idleExpiresAt = Math.min(now + env.sessionIdleSeconds * 1000, row.absolute_expires_at)
  touchSession.run(now, idleExpiresAt, row.id)

  return {
    id: row.id,
    userId: row.user_id,
    csrf: csrfTokenFor(row.id),
    absoluteExpiresAt: row.absolute_expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      globalName: row.global_name,
      avatar: row.avatar,
    },
  }
}

export function revokeSession(id) {
  revokeById.run(Date.now(), id)
}

export function revokeAllSessions(userId) {
  revokeByUser.run(Date.now(), userId)
}

export function pruneSessions() {
  deleteExpired.run(Date.now() - 60 * 60 * 1000)
}
