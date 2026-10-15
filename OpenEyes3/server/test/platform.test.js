import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test, { before, after } from 'node:test'
import { ORIGIN, OWNER_ID, TOTP_SECRET } from './setup.js'

const { buildApp } = await import('../src/app.js')
const { db } = await import('../src/db.js')
const { createSession, CSRF_HEADER } = await import('../src/security/sessions.js')
const { totpCode } = await import('../src/security/totp.js')
const { isPublicAddress, checkTarget } = await import('../src/security/egress.js')
const { reserve, quotaState } = await import('../src/usage.js')

const BUYER = '444555666777888999'
let app
let owner
let buyer

function as(session) {
  return {
    cookies: { openeyes_session: session.token, openeyes_csrf: session.csrf },
    headers: { origin: ORIGIN, 'user-agent': 'test-agent', [CSRF_HEADER]: session.csrf },
  }
}

before(async () => {
  app = await buildApp({ logger: false })
  const now = Date.now()
  const addUser = db.prepare(
    'INSERT OR REPLACE INTO users (id, username, global_name, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  addUser.run(OWNER_ID, 'owner', null, null, now, now)
  addUser.run(BUYER, 'buyer', null, null, now, now)
  owner = createSession(OWNER_ID, { ip: '127.0.0.1', userAgent: 'test-agent' })
  buyer = createSession(BUYER, { ip: '127.0.0.1', userAgent: 'test-agent' })

  const code = totpCode(TOTP_SECRET)
  const res = await app.inject({ method: 'POST', url: '/api/admin/session', ...as(owner), payload: { code } })
  assert.equal(res.statusCode, 200, res.body)
})

after(async () => {
  await app?.close()
})

test('the two default plans are seeded with their daily limits', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/billing/plans' })
  const plans = Object.fromEntries(res.json().plans.map((p) => [p.id, p]))
  assert.equal(plans.monthly.dailyLimit, 20)
  assert.equal(plans.lifetime.dailyLimit, 70)
  assert.equal(plans.lifetime.lifetime, true)
})

test('the owner can create a plan and it goes on sale', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/plans',
    ...as(owner),
    payload: { id: 'weekly', name: 'Weekly', usdCents: 300, durationDays: 7, lifetime: false, dailyLimit: 10 },
  })
  assert.equal(res.statusCode, 201, res.body)
  const list = await app.inject({ method: 'GET', url: '/api/billing/plans' })
  assert.ok(list.json().plans.some((p) => p.id === 'weekly'))
})

test('a plan can be taken off sale without deleting it', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/plans/weekly',
    ...as(owner),
    payload: { name: 'Weekly', usdCents: 350, durationDays: 7, lifetime: false, dailyLimit: 10, active: false },
  })
  assert.equal(res.statusCode, 200, res.body)
  assert.equal(res.json().plan.usdCents, 350)
  const list = await app.inject({ method: 'GET', url: '/api/billing/plans' })
  assert.ok(!list.json().plans.some((p) => p.id === 'weekly'))

  const invoice = await app.inject({
    method: 'POST',
    url: '/api/billing/invoice',
    ...as(buyer),
    payload: { planId: 'weekly', asset: 'btc' },
  })
  assert.equal(invoice.statusCode, 400)
})

test('a plan with a malformed id or a hostile name shape is refused', async () => {
  for (const payload of [
    { id: "x'; DROP TABLE plans;--", name: 'Bad', usdCents: 500, durationDays: 30, lifetime: false },
    { id: 'ok-id', name: 'Bad', usdCents: 5, durationDays: 30, lifetime: false },
    { id: 'ok-id', name: 'Bad', usdCents: 500, lifetime: false },
  ]) {
    const res = await app.inject({ method: 'POST', url: '/api/admin/plans', ...as(owner), payload })
    assert.equal(res.statusCode, 400, JSON.stringify(payload))
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'plans'").get().n, 1)
})

test('a member cannot reach the plan or sales endpoints', async () => {
  for (const url of ['/api/admin/plans', '/api/admin/sales']) {
    const res = await app.inject({ method: 'GET', url, ...as(buyer) })
    assert.equal(res.statusCode, 404)
  }
})

test('the sales dashboard adds up settled invoices', async () => {
  const now = Date.now()
  const insert = db.prepare(`
    INSERT INTO invoices (id, user_id, plan_id, asset, address, derivation_index, amount_usd_cents, amount_units,
      min_units, received_units, rate_usd, confirmations_req, status, created_at, expires_at, settled_at, credited_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '64000', 2, ?, ?, ?, ?, ?)
  `)
  insert.run('a'.repeat(32), BUYER, 'monthly', 'btc', 'bc1qsalesaaa', 9001, 900, 14000, 14000, 14000, 'settled', now, now, now, now)
  insert.run('b'.repeat(32), BUYER, 'lifetime', 'ltc', 'ltc1qsalesbbb', 9002, 12000, 1000000, 1000000, 1000000, 'settled', now, now, now, now)
  insert.run('c'.repeat(32), BUYER, 'monthly', 'btc', 'bc1qsalesccc', 9003, 900, 14000, 14000, 0, 'expired', now, now, null, null)

  const res = await app.inject({ method: 'GET', url: '/api/admin/sales?days=30', ...as(owner) })
  assert.equal(res.statusCode, 200, res.body)
  const sales = res.json()
  assert.ok(sales.totals.range.cents >= 12900)
  assert.equal(sales.series.length, 30)
  assert.ok(sales.byPlan.some((p) => p.planId === 'lifetime' && p.cents >= 12000))
  assert.ok(sales.byAsset.some((a) => a.asset === 'ltc'))
  assert.ok(sales.conversion.created >= 3)
})

test('the sales window only accepts the offered ranges', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/sales?days=1000', ...as(owner) })
  assert.equal(res.statusCode, 400)
})

test('the daily limit holds under concurrent reservations', () => {
  db.prepare('INSERT OR REPLACE INTO entitlements (user_id, plan_id, lifetime, expires_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(
    BUYER,
    'monthly',
    Date.now() + 86400000,
    Date.now(),
  )
  db.prepare('DELETE FROM usage_daily WHERE user_id = ?').run(BUYER)
  const results = Array.from({ length: 25 }, () => reserve(BUYER).ok)
  assert.equal(results.filter(Boolean).length, 20)
  assert.equal(quotaState(BUYER).remaining, 0)
})

test('the owner has no daily limit', () => {
  assert.equal(quotaState(OWNER_ID).unlimited, true)
  for (let i = 0; i < 200; i += 1) assert.equal(reserve(OWNER_ID).ok, true)
})

test('private, loopback and metadata addresses count as internal', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '0.0.0.0']) {
    assert.equal(isPublicAddress(ip), false, ip)
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) {
    assert.equal(isPublicAddress(ip), true, ip)
  }
})

test('internal targets are refused before any request goes out', () => {
  for (const url of [
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://localhost:8000/api/admin/overview',
    'file:///etc/passwd',
    'http://example.com:22/',
    'http://user:pass@example.com/',
  ]) {
    assert.throws(() => checkTarget(url), url)
  }
  assert.doesNotThrow(() => checkTarget('https://example.com/'))
})

test('a name that resolves to loopback is refused at connect time', async () => {
  const { safeFetch, EgressError } = await import('../src/security/egress.js')
  await assert.rejects(() => safeFetch('http://localhost./'), EgressError)
})

test('no SQL statement in the server is built from interpolated values', () => {
  const offenders = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.js')) {
        const source = readFileSync(path, 'utf8')
        const calls = source.match(/\b(?:prepare|exec)\(\s*`[^`]*`/g) || []
        for (const call of calls) if (call.includes('${')) offenders.push(`${path}: ${call.slice(0, 80)}`)
        if (/\b(?:prepare|exec)\(\s*[^`'"\s)]/.test(source.replace(/\b(?:prepare|exec)\(\s*`[^`]*`/g, ''))) {
          offenders.push(`${path}: statement passed as a variable`)
        }
      }
    }
  }
  walk(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  assert.deepEqual(offenders, [])
})
