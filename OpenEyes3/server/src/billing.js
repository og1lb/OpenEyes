import { audit, db, transaction } from './db.js'
import { env } from './env.js'
import { getPlan } from './plans.js'
import { deriveAddress, parseAccountKey, paymentUri } from './chain/hd.js'
import { createChainClient } from './chain/esplora.js'
import { usdRate } from './chain/rates.js'
import { extendEntitlement, syncRole } from './entitlements.js'
import { randomId } from './security/crypto.js'

const accounts = new Map()
const clients = new Map()

export function enabledAssets() {
  return Object.entries(env.chains)
    .filter(([, chain]) => chain.enabled)
    .map(([id]) => id)
}

export function setChainClient(asset, client) {
  clients.set(asset, client)
}

export function initChains() {
  for (const [id, chain] of Object.entries(env.chains)) {
    if (!chain.enabled) continue
    accounts.set(id, parseAccountKey(chain.xpub))
    clients.set(id, createChainClient(chain))
  }
}

const takeIndex = db.prepare('UPDATE derivation_counters SET next_index = next_index + 1 WHERE asset = ? RETURNING next_index')
const insertInvoice = db.prepare(`
  INSERT INTO invoices
    (id, user_id, plan_id, asset, address, derivation_index, amount_usd_cents, amount_units, min_units,
     rate_usd, confirmations_req, status, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
`)
const selectOpenForPlan = db.prepare(`
  SELECT * FROM invoices
  WHERE user_id = ? AND plan_id = ? AND asset = ? AND status = 'open' AND expires_at > ?
  ORDER BY created_at DESC LIMIT 1
`)
const selectInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?')
const selectWatchable = db.prepare(`
  SELECT * FROM invoices
  WHERE (status = 'open' AND expires_at > ?)
     OR (status = 'seen' AND seen_at > ?)
  ORDER BY created_at ASC LIMIT 200
`)
const abandonSeen = db.prepare(
  "UPDATE invoices SET status = 'underpaid' WHERE status = 'seen' AND seen_at < ? RETURNING id",
)
const countOpenForUser = db.prepare(
  "SELECT COUNT(*) AS n FROM invoices WHERE user_id = ? AND status = 'open' AND expires_at > ?",
)
const upsertTx = db.prepare(`
  INSERT INTO invoice_txs (asset, txid, vout, invoice_id, units, confirmed, first_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(asset, txid, vout) DO UPDATE SET confirmed = excluded.confirmed
`)
const sumConfirmed = db.prepare(
  'SELECT COALESCE(SUM(units), 0) AS total FROM invoice_txs WHERE invoice_id = ? AND confirmed = 1',
)
const sumSeen = db.prepare('SELECT COALESCE(SUM(units), 0) AS total FROM invoice_txs WHERE invoice_id = ?')
const markSeen = db.prepare("UPDATE invoices SET status = 'seen', seen_at = ?, received_units = ? WHERE id = ? AND status = 'open'")
const markReceived = db.prepare('UPDATE invoices SET received_units = ? WHERE id = ?')
const expireStale = db.prepare(
  "UPDATE invoices SET status = 'expired' WHERE status = 'open' AND received_units = 0 AND expires_at < ? RETURNING id",
)
const settleInvoice = db.prepare(`
  UPDATE invoices SET status = 'settled', settled_at = ?, credited_at = ?, received_units = ?
  WHERE id = ? AND credited_at IS NULL
  RETURNING user_id, plan_id
`)

export const MAX_OPEN_INVOICES = 3

export async function createInvoice(userId, planId, asset) {
  const plan = getPlan(planId)
  if (!plan || !plan.active) throw Object.assign(new Error('that plan is not on sale'), { statusCode: 400 })

  const chain = env.chains[asset]
  if (!chain?.enabled || !accounts.has(asset)) {
    throw Object.assign(new Error('this asset is not accepted'), { statusCode: 400 })
  }

  const now = Date.now()
  const existing = selectOpenForPlan.get(userId, planId, asset, now)
  if (existing) return present(existing)

  if (countOpenForUser.get(userId, now).n >= MAX_OPEN_INVOICES) {
    throw Object.assign(new Error('too many open invoices, settle or wait for one to expire'), { statusCode: 429 })
  }

  const rate = await usdRate(asset)
  if (!rate) {
    throw Object.assign(new Error('no exchange rate is configured, cannot price an invoice'), { statusCode: 503 })
  }

  const amountUnits = Math.ceil((plan.usdCents / 100 / rate) * 1e8)
  if (!Number.isSafeInteger(amountUnits) || amountUnits <= 0) {
    throw Object.assign(new Error('priced amount is out of range'), { statusCode: 503 })
  }
  const minUnits = Math.max(1, amountUnits - Math.floor((amountUnits * env.invoiceUnderpayTolerance) / 1_000_000))

  const row = transaction(() => {
    const index = takeIndex.get(asset).next_index - 1
    const address = deriveAddress(accounts.get(asset), chain.hrp, index)
    const id = randomId(16)
    insertInvoice.run(
      id,
      userId,
      plan.id,
      asset,
      address,
      index,
      plan.usdCents,
      amountUnits,
      minUnits,
      String(rate),
      chain.confirmations,
      now,
      now + env.invoiceTtlSeconds * 1000,
    )
    return selectInvoice.get(id)
  })

  audit('invoice.created', {
    actor: userId,
    subject: row.id,
    detail: { plan: plan.id, asset, amountUnits, rate },
  })

  return present(row)
}

export function present(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    asset: row.asset,
    address: row.address,
    uri: paymentUri(row.asset, row.address, row.amount_units),
    amountUnits: row.amount_units,
    amount: (row.amount_units / 1e8).toFixed(8),
    receivedUnits: row.received_units,
    received: (row.received_units / 1e8).toFixed(8),
    amountUsd: (row.amount_usd_cents / 100).toFixed(2),
    rateUsd: row.rate_usd,
    confirmationsRequired: row.confirmations_req,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    settledAt: row.settled_at,
  }
}

export function invoiceFor(userId, id) {
  const row = selectInvoice.get(id)
  if (!row || row.user_id !== userId) return null
  return present(row)
}

async function checkInvoice(row, tipCache) {
  const client = clients.get(row.asset)
  if (!client) return

  let tip = tipCache.get(row.asset)
  if (tip === undefined) {
    tip = await client.tipHeight()
    tipCache.set(row.asset, tip)
  }

  const outputs = await client.outputsFor(row.address)
  const required = row.confirmations_req
  const now = Date.now()

  for (const output of outputs) {
    const confirmations = output.confirmed && output.blockHeight ? tip - output.blockHeight + 1 : 0
    upsertTx.run(
      row.asset,
      output.txid,
      output.vout,
      row.id,
      output.units,
      confirmations >= required ? 1 : 0,
      now,
    )
  }

  const seenTotal = sumSeen.get(row.id).total
  const confirmedTotal = sumConfirmed.get(row.id).total

  if (seenTotal > 0 && row.status === 'open') {
    markSeen.run(now, seenTotal, row.id)
  } else {
    markReceived.run(seenTotal, row.id)
  }

  if (confirmedTotal < row.min_units) return

  const credited = transaction(() => {
    const result = settleInvoice.get(now, now, confirmedTotal, row.id)
    if (!result) return null
    const plan = getPlan(result.plan_id)
    if (!plan) throw new Error(`invoice ${row.id} references an unknown plan`)
    extendEntitlement(result.user_id, plan)
    return result
  })

  if (!credited) return

  audit('invoice.settled', {
    actor: credited.user_id,
    subject: row.id,
    detail: { asset: row.asset, units: confirmedTotal, plan: credited.plan_id },
  })

  try {
    await syncRole(credited.user_id, `payment ${row.id} settled`)
  } catch (err) {
    audit('discord.role_grant_failed', {
      actor: credited.user_id,
      subject: row.id,
      detail: { message: err.message },
    })
  }
}

const EXPIRY_GRACE_MS = 60 * 60 * 1000
const SEEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export async function watchTick(log) {
  const now = Date.now()
  for (const row of expireStale.all(now - EXPIRY_GRACE_MS)) {
    audit('invoice.expired', { subject: row.id })
  }
  for (const row of abandonSeen.all(now - SEEN_WINDOW_MS)) {
    audit('invoice.underpaid', { subject: row.id })
  }

  const rows = selectWatchable.all(now - EXPIRY_GRACE_MS, now - SEEN_WINDOW_MS)
  const tipCache = new Map()
  for (const row of rows) {
    try {
      await checkInvoice(row, tipCache)
    } catch (err) {
      log?.warn({ invoice: row.id, err: err.message }, 'invoice check failed')
    }
  }
  return rows.length
}
