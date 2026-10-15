import { db } from './db.js'
import { env } from './env.js'
import { getPlan } from './plans.js'

const selectEntitlement = db.prepare('SELECT plan_id, lifetime, expires_at, updated_at FROM entitlements WHERE user_id = ?')
const upsertEntitlement = db.prepare(`
  INSERT INTO entitlements (user_id, plan_id, lifetime, expires_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id, lifetime=excluded.lifetime, expires_at=excluded.expires_at, updated_at=excluded.updated_at
`)
const selectUserRole = db.prepare('SELECT role FROM users WHERE id = ?')

export function isOwnerId(userId) { return env.admin.ownerIds.includes(String(userId)) || selectUserRole.get(userId)?.role === 'owner' }
export function isAdminId(userId) { const r = selectUserRole.get(userId)?.role; return r === 'owner' || r === 'admin' }

export function readEntitlement(userId) {
  const row = selectEntitlement.get(userId)
  if (!row) return null
  const lifetime = row.lifetime === 1
  const active = lifetime || (row.expires_at !== null && row.expires_at > Date.now())
  return { planId: row.plan_id, lifetime, expiresAt: lifetime ? null : row.expires_at, active }
}

export function ensureFreeEntitlement(userId) {
  if (readEntitlement(userId)) return readEntitlement(userId)
  const now = Date.now()
  upsertEntitlement.run(userId, 'free', 1, null, now)
  return readEntitlement(userId)
}

export function extendEntitlement(userId, plan) {
  const now = Date.now()
  const current = readEntitlement(userId)
  if (plan.lifetime) upsertEntitlement.run(userId, plan.id, 1, null, now)
  else {
    const base = current?.active && current.expiresAt ? current.expiresAt : now
    upsertEntitlement.run(userId, plan.id, 0, base + plan.durationDays * 86400000, now)
  }
  return readEntitlement(userId)
}

export async function refreshRoleState(userId) {
  const role = selectUserRole.get(userId)?.role || 'user'
  return { inGuild: true, hasRole: true, roles: [role], stale: false, checkedAt: Date.now() }
}
export async function roleState(userId) { return refreshRoleState(userId) }
export async function syncRole(userId) { return { entitlement: readEntitlement(userId), role: await refreshRoleState(userId), changed: false } }
export async function accessFor(userId) {
  const entitlement = ensureFreeEntitlement(userId)
  return { allowed: true, reason: 'authenticated', entitlement, role: await refreshRoleState(userId), owner: isOwnerId(userId) }
}
export async function reconcileAll() { return { checked: 0, changed: 0, failed: 0 } }
export function managedRoleIds() { return [] }
