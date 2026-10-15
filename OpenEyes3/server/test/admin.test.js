import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { ORIGIN, OWNER_ID, TOTP_SECRET } from './setup.js'

const { buildApp } = await import('../src/app.js')
const { db } = await import('../src/db.js')
const { initChains } = await import('../src/billing.js')
const { readEntitlement } = await import('../src/entitlements.js')
const { createSession, CSRF_HEADER } = await import('../src/security/sessions.js')
const { totpCode } = await import('../src/security/totp.js')

initChains()

const MEMBER_ID = '888000888000888000'

let app
let owner
let member

function makeUser(id, username) {
  const now = Date.now()
  db.prepare(
    'INSERT OR REPLACE INTO users (id, username, global_name, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, username, null, null, now, now)
}

before(async () => {
  app = await buildApp({ logger: false })
  makeUser(OWNER_ID, 'owner')
  makeUser(MEMBER_ID, 'member')
  owner = createSession(OWNER_ID, { ip: '127.0.0.1', userAgent: 'test-agent' })
  member = createSession(MEMBER_ID, { ip: '127.0.0.1', userAgent: 'test-agent' })
})

after(async () => {
  await app?.close()
})

function as(session, { headers = {}, ...rest } = {}) {
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

test('a paying member cannot see that the admin surface exists', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/session', ...as(member) })
  assert.equal(res.statusCode, 404)
})

test('a paying member is refused on an admin action, with no hint of why', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/entitlement',
    ...as(member),
    payload: { userId: MEMBER_ID, action: 'grant', planId: 'lifetime' },
  })
  assert.equal(res.statusCode, 404)
  assert.equal(readEntitlement(MEMBER_ID), null)
})

test('the owner is known but not yet elevated', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/session', ...as(owner) })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { owner: true, elevated: false, until: null, secondFactor: true })
})

test('an admin action before the code is refused', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/overview', ...as(owner) })
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().code, 'step_up_required')
})

test('the owner cannot step up without the csrf header', async () => {
  const request = as(owner)
  delete request.headers[CSRF_HEADER]
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/session',
    ...request,
    payload: { code: totpCode(TOTP_SECRET) },
  })
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().code, 'bad_csrf')
})

test('a valid code elevates the owner session', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/session',
    ...as(owner),
    payload: { code: totpCode(TOTP_SECRET) },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().elevated, true)
})

test('the overview opens once the session is elevated', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/admin/overview', ...as(owner) })
  assert.equal(res.statusCode, 200)
  assert.equal(typeof res.json().users, 'number')
})

test('the owner can grant and revoke a lifetime entitlement', async () => {
  const grant = await app.inject({
    method: 'POST',
    url: '/api/admin/entitlement',
    ...as(owner),
    payload: { userId: MEMBER_ID, action: 'grant', planId: 'lifetime' },
  })
  assert.equal(grant.statusCode, 200)
  assert.equal(readEntitlement(MEMBER_ID).lifetime, true)

  const revoke = await app.inject({
    method: 'POST',
    url: '/api/admin/entitlement',
    ...as(owner),
    payload: { userId: MEMBER_ID, action: 'revoke' },
  })
  assert.equal(revoke.statusCode, 200)
  assert.equal(readEntitlement(MEMBER_ID), null)
})

test('blocking a member kills the entitlement and every session it had', async () => {
  await app.inject({
    method: 'POST',
    url: '/api/admin/entitlement',
    ...as(owner),
    payload: { userId: MEMBER_ID, action: 'grant', planId: 'monthly' },
  })

  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/user/block',
    ...as(owner),
    payload: { userId: MEMBER_ID, blocked: true },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(readEntitlement(MEMBER_ID), null)

  const after = await app.inject({ method: 'GET', url: '/api/me', ...as(member) })
  assert.deepEqual(after.json(), { authenticated: false })
})

test('the owner cannot block their own account', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/user/block',
    ...as(owner),
    payload: { userId: OWNER_ID, blocked: true },
  })
  assert.equal(res.statusCode, 400)
  assert.equal(res.json().code, 'self')
})

test('stepping down closes the admin surface again', async () => {
  const end = await app.inject({ method: 'POST', url: '/api/admin/session/end', ...as(owner) })
  assert.equal(end.statusCode, 200)
  assert.equal(end.json().elevated, false)

  const res = await app.inject({ method: 'GET', url: '/api/admin/overview', ...as(owner) })
  assert.equal(res.statusCode, 403)
})

test('the same code cannot be used a second time', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/session',
    ...as(owner),
    payload: { code: totpCode(TOTP_SECRET) },
  })
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().code, 'replayed')
})

test('guessing locks the owner out after five wrong codes', async () => {
  const wrong = (n) => String(100000 + n).padStart(6, '0')
  let last
  for (let i = 0; i < 5; i += 1) {
    last = await app.inject({
      method: 'POST',
      url: '/api/admin/session',
      ...as(owner),
      payload: { code: wrong(i) },
    })
    assert.equal(last.statusCode, 403)
  }
  assert.equal(last.json().code, 'rejected')
  assert.ok(last.json().retryAt > Date.now())

  const locked = await app.inject({
    method: 'POST',
    url: '/api/admin/session',
    ...as(owner),
    payload: { code: totpCode(TOTP_SECRET, Date.now() + 60_000) },
  })
  assert.equal(locked.statusCode, 403)
  assert.equal(locked.json().code, 'locked')
})
