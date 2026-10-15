import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { ORIGIN } from './setup.js'

const { buildApp } = await import('../src/app.js')
const { db } = await import('../src/db.js')
const { initChains, setChainClient, watchTick } = await import('../src/billing.js')
const { readEntitlement } = await import('../src/entitlements.js')
const { createSession, CSRF_HEADER } = await import('../src/security/sessions.js')
const { parseAccountKey } = await import('../src/chain/hd.js')

initChains()

const USER_ID = '999000999000999000'

let app
let session

before(async () => {
  app = await buildApp({ logger: false })
  const now = Date.now()
  db.prepare(
    'INSERT OR REPLACE INTO users (id, username, global_name, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(USER_ID, 'tester', null, null, now, now)
  session = createSession(USER_ID, { ip: '127.0.0.1', userAgent: 'test-agent' })
})

after(async () => {
  await app?.close()
})

function authed({ headers = {}, ...rest } = {}) {
  return {
    cookies: { openeyes_session: session.token, openeyes_csrf: session.csrf },
    headers: {
      origin: ORIGIN,
      'user-agent': 'test-agent',
      [CSRF_HEADER]: session.csrf,
      ...headers,
    },
    ...rest,
  }
}

test('local owner credentials authenticate and create an owner session', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: ORIGIN },
    payload: { username: 'owner', password: 'change-this-to-a-long-random-password' },
  })
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.equal(body.authenticated, true)
  assert.equal(body.owner, true)
  assert.equal(body.role.name, 'owner')
  assert.ok(res.cookies.some((cookie) => cookie.name === 'openeyes_session'))
  assert.ok(res.cookies.some((cookie) => cookie.name === 'openeyes_csrf'))
})

test('health is public', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().ok, true)
})

test('an anonymous caller is not authenticated', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/me' })
  assert.deepEqual(res.json(), { authenticated: false })
})

test('an invoice cannot be opened without a session', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    headers: { origin: ORIGIN },
    payload: { planId: 'monthly', asset: 'btc' },
  })
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().code, 'csrf')
})

test('a session without the csrf header is rejected', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    cookies: { openeyes_session: session.token, openeyes_csrf: session.csrf },
    headers: { origin: ORIGIN, 'user-agent': 'test-agent' },
    payload: { planId: 'monthly', asset: 'btc' },
  })
  assert.equal(res.statusCode, 403)
})

test('a request from a foreign origin is rejected', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    ...authed({ headers: { origin: 'https://evil.example' } }),
    payload: { planId: 'monthly', asset: 'btc' },
  })
  assert.equal(res.statusCode, 403)
})

test('an unknown plan is refused by the schema', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    ...authed(),
    payload: { planId: 'free-forever', asset: 'btc' },
  })
  assert.equal(res.statusCode, 400)
})

let invoice

test('a signed in caller gets an invoice with a derived address', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    ...authed(),
    payload: { planId: 'monthly', asset: 'btc' },
  })
  assert.equal(res.statusCode, 200)
  invoice = res.json().invoice
  assert.match(invoice.address, /^bc1q[02-9ac-hj-np-z]{38}$/)
  assert.equal(invoice.status, 'open')
  assert.ok(invoice.amountUnits > 0)
  assert.match(invoice.uri, /^bitcoin:bc1q/)
})

test('asking again returns the same open invoice', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    ...authed(),
    payload: { planId: 'monthly', asset: 'btc' },
  })
  assert.equal(res.json().invoice.id, invoice.id)
})

test('another account cannot read the invoice', async () => {
  const now = Date.now()
  db.prepare(
    'INSERT OR REPLACE INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run('111000111000111000', 'stranger', now, now)
  const other = createSession('111000111000111000', { ip: '127.0.0.1', userAgent: 'test-agent' })
  const res = await app.inject({
    method: 'GET',
    url: `/api/billing/invoice/${invoice.id}`,
    cookies: { openeyes_session: other.token, openeyes_csrf: other.csrf },
    headers: { 'user-agent': 'test-agent', [CSRF_HEADER]: other.csrf },
  })
  assert.equal(res.statusCode, 404)
})

test('an underpayment does not settle the invoice', async () => {
  setChainClient('btc', {
    async tipHeight() {
      return 1000
    },
    async outputsFor() {
      return [{ txid: 'a'.repeat(64), vout: 0, units: Math.floor(invoice.amountUnits / 2), confirmed: true, blockHeight: 999 }]
    },
  })
  await watchTick()
  assert.equal(readEntitlement(USER_ID), null)
  const row = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id)
  assert.equal(row.status, 'seen')
})

test('an unconfirmed full payment does not settle the invoice', async () => {
  setChainClient('btc', {
    async tipHeight() {
      return 1000
    },
    async outputsFor() {
      return [{ txid: 'b'.repeat(64), vout: 0, units: invoice.amountUnits, confirmed: false, blockHeight: null }]
    },
  })
  await watchTick()
  assert.equal(readEntitlement(USER_ID), null)
})

test('a confirmed payment credits the entitlement', async () => {
  setChainClient('btc', {
    async tipHeight() {
      return 1010
    },
    async outputsFor() {
      return [{ txid: 'b'.repeat(64), vout: 0, units: invoice.amountUnits, confirmed: true, blockHeight: 1000 }]
    },
  })
  await watchTick()

  const entitlement = readEntitlement(USER_ID)
  assert.ok(entitlement)
  assert.equal(entitlement.active, true)
  assert.equal(entitlement.planId, 'monthly')
  assert.equal(entitlement.lifetime, false)

  const row = db.prepare('SELECT status, credited_at FROM invoices WHERE id = ?').get(invoice.id)
  assert.equal(row.status, 'settled')
  assert.ok(row.credited_at)
})

test('a second sweep does not credit the same payment twice', async () => {
  const before = readEntitlement(USER_ID).expiresAt
  await watchTick()
  assert.equal(readEntitlement(USER_ID).expiresAt, before)
})

test('the panel is gated while discord cannot confirm the role', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/run/domain-recon',
    ...authed(),
    payload: { domain: 'example.com' },
  })
  assert.equal(res.statusCode, 403)
})

test('losing the role closes the panel even while discord is unreachable', async () => {
  const { accessFor } = await import('../src/entitlements.js')
  const setRole = db.prepare(`
    INSERT INTO role_state (user_id, in_guild, has_role, checked_at, stale) VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      in_guild = excluded.in_guild,
      has_role = excluded.has_role,
      checked_at = excluded.checked_at,
      stale = excluded.stale
  `)

  setRole.run(USER_ID, 1, Date.now(), 1)
  assert.equal((await accessFor(USER_ID)).allowed, true)

  setRole.run(USER_ID, 0, Date.now(), 1)
  const gone = await accessFor(USER_ID)
  assert.equal(gone.allowed, false)
  assert.equal(gone.reason, 'no_role')

  setRole.run(USER_ID, 1, Date.now() - 20 * 60 * 1000, 1)
  const stale = await accessFor(USER_ID)
  assert.equal(stale.allowed, false)
})

test('an extended private key is refused', () => {
  assert.throws(
    () =>
      parseAccountKey(
        'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
      ),
    /extended private key/,
  )
})

test('a lifetime payment overrides the monthly expiry', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    ...authed(),
    payload: { planId: 'lifetime', asset: 'ltc' },
  })
  const lifetime = res.json().invoice
  assert.match(lifetime.address, /^ltc1q/)

  setChainClient('ltc', {
    async tipHeight() {
      return 2000
    },
    async outputsFor() {
      return [{ txid: 'c'.repeat(64), vout: 0, units: lifetime.amountUnits, confirmed: true, blockHeight: 1990 }]
    },
  })
  await watchTick()

  const entitlement = readEntitlement(USER_ID)
  assert.equal(entitlement.lifetime, true)
  assert.equal(entitlement.expiresAt, null)
  assert.equal(entitlement.active, true)
})

test('the account key must be watch only', () => {
  const node = parseAccountKey(process.env.BTC_XPUB)
  assert.equal(node.privateKey, null)
})

test('the waitlist takes an address and hands back one reference', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/early-access',
    headers: { origin: ORIGIN },
    payload: { email: 'Reader@Example.com', submittedAt: new Date().toISOString() },
  })
  assert.equal(res.statusCode, 200)
  assert.match(res.json().id, /^IS-[0-9A-Z]+-[0-9A-F]{4}$/)

  const again = await app.inject({
    method: 'POST',
    url: '/api/early-access',
    headers: { origin: ORIGIN },
    payload: { email: 'reader@example.com' },
  })
  assert.equal(again.json().id, res.json().id)
})

test('the waitlist refuses something that is not an address', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/early-access',
    headers: { origin: ORIGIN },
    payload: { email: 'not-an-address' },
  })
  assert.equal(res.statusCode, 400)
})
