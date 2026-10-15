import { call } from './session.js'

export function adminSession(signal) {
  return call('/api/admin/session', { signal })
}

export function adminStepUp(code) {
  return call('/api/admin/session', { method: 'POST', body: { code } })
}

export function adminStepDown() {
  return call('/api/admin/session/end', { method: 'POST' })
}

export function adminOverview(signal) {
  return call('/api/admin/overview', { signal })
}

export function adminUsers(query, signal) {
  const search = query ? `?q=${encodeURIComponent(query)}` : ''
  return call(`/api/admin/users${search}`, { signal })
}

export function adminInvoices(status, signal) {
  const search = status ? `?status=${encodeURIComponent(status)}` : ''
  return call(`/api/admin/invoices${search}`, { signal })
}

export function adminAudit(signal) {
  return call('/api/admin/audit', { signal })
}

export function adminEntitlement(body) {
  return call('/api/admin/entitlement', { method: 'POST', body })
}

export function adminBlock(userId, blocked) {
  return call('/api/admin/user/block', { method: 'POST', body: { userId, blocked } })
}

export function adminSync(userId) {
  return call('/api/admin/user/sync', { method: 'POST', body: { userId } })
}

export function adminReconcile() {
  return call('/api/admin/reconcile', { method: 'POST' })
}

export function adminPlans(signal) {
  return call('/api/admin/plans', { signal })
}

export function adminCreatePlan(plan) {
  return call('/api/admin/plans', { method: 'POST', body: plan })
}

export function adminUpdatePlan(id, plan) {
  return call(`/api/admin/plans/${encodeURIComponent(id)}`, { method: 'POST', body: plan })
}

export function adminSales(days, signal) {
  return call(`/api/admin/sales?days=${encodeURIComponent(String(days))}`, { signal })
}
