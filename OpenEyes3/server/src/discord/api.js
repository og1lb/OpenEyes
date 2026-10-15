import { env } from '../env.js'

const BASE = 'https://discord.com/api/v10'
const TIMEOUT_MS = 10000

export class DiscordError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'DiscordError'
    this.status = status
  }
}

async function call(path, { method = 'GET', headers = {}, body, retry = true } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'openeyes/0.1 (self-hosted)', ...headers },
      body,
    })
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 429 && retry) {
    const payload = await res.json().catch(() => null)
    const wait = Math.min(Number(payload?.retry_after) || 1, 10)
    await new Promise((done) => setTimeout(done, wait * 1000))
    return call(path, { method, headers, body, retry: false })
  }

  if (res.status === 204) return null
  const text = await res.text()
  const payload = text ? JSON.parse(text) : null
  if (!res.ok) throw new DiscordError(payload?.message || `discord answered ${res.status}`, res.status)
  return payload
}

export function authorizeUrl({ state, challenge }) {
  const params = new URLSearchParams({
    client_id: env.discord.clientId,
    redirect_uri: env.discord.redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'none',
  })
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

export async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    client_id: env.discord.clientId,
    client_secret: env.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.discord.redirectUri,
    code_verifier: verifier,
  })
  const payload = await call('/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!payload?.access_token) throw new DiscordError('token exchange returned no access token', 502)
  return payload
}

export async function revokeToken(token) {
  const body = new URLSearchParams({
    client_id: env.discord.clientId,
    client_secret: env.discord.clientSecret,
    token,
    token_type_hint: 'access_token',
  })
  await call('/oauth2/token/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }).catch(() => null)
}

export async function fetchIdentity(accessToken) {
  const me = await call('/users/@me', { headers: { authorization: `Bearer ${accessToken}` } })
  if (!me?.id || !/^\d{5,25}$/.test(me.id)) throw new DiscordError('identity response had no usable id', 502)
  return {
    id: me.id,
    username: String(me.username || '').slice(0, 64),
    globalName: me.global_name ? String(me.global_name).slice(0, 64) : null,
    avatar: me.avatar ? String(me.avatar).slice(0, 64) : null,
  }
}

function botHeaders() {
  return { authorization: `Bot ${env.discord.botToken}` }
}

const SNOWFLAKE = /^\d{5,25}$/

function snowflake(value, what) {
  if (typeof value !== 'string' || !SNOWFLAKE.test(value)) throw new DiscordError(`${what} is not a Discord id`, 400)
  return value
}

export async function readMember(userId) {
  try {
    const member = await call(`/guilds/${snowflake(env.discord.guildId, 'guild')}/members/${snowflake(userId, 'user')}`, {
      headers: botHeaders(),
    })
    const roles = Array.isArray(member?.roles) ? member.roles.filter((r) => typeof r === 'string' && SNOWFLAKE.test(r)) : []
    return { inGuild: true, roles }
  } catch (err) {
    if (err instanceof DiscordError && err.status === 404) return { inGuild: false, roles: [] }
    throw err
  }
}

async function setRole(method, userId, roleId, reason) {
  await call(
    `/guilds/${snowflake(env.discord.guildId, 'guild')}/members/${snowflake(userId, 'user')}/roles/${snowflake(roleId, 'role')}`,
    {
      method,
      headers: { ...botHeaders(), 'x-audit-log-reason': encodeURIComponent(reason).slice(0, 400) },
    },
  )
}

export function grantRole(userId, roleId, reason) {
  return setRole('PUT', userId, roleId, reason)
}

export function revokeRole(userId, roleId, reason) {
  return setRole('DELETE', userId, roleId, reason)
}
