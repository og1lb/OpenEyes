import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodeBase32 } from './security/totp.js'

function loadEnvFile(path) {
  let raw
  try { raw = readFileSync(path, 'utf8') } catch { return }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (key in process.env) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile(process.env.OPENEYES_ENV_FILE || resolve(process.cwd(), '.env'))
loadEnvFile(process.env.OPENEYES_API_ENV_FILE || resolve(process.cwd(), 'api.env'))

const problems = []

function str(name, { required = false, fallback = '' } = {}) {
  const value = (process.env[name] ?? '').trim()
  if (!value) {
    if (required) problems.push(`${name} is missing`)
    return fallback
  }
  return value
}

function int(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = (process.env[name] ?? '').trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name} must be an integer between ${min} and ${max}`)
    return fallback
  }
  return value
}

function bool(name, fallback) {
  const raw = (process.env[name] ?? '').trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  problems.push(`${name} must be a boolean`)
  return fallback
}

function secret(name, { required = true } = {}) {
  const value = str(name, { required })
  if (value && value.length < 32) problems.push(`${name} must be at least 32 characters`)
  if (value && /^(changeme|secret|password|test)/i.test(value)) {
    problems.push(`${name} looks like a placeholder`)
  }
  return value
}

function list(name) {
  return str(name)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const nodeEnv = str('NODE_ENV', { fallback: 'production' })
const isProduction = nodeEnv === 'production'

const publicUrl = str('PUBLIC_URL', { fallback: 'http://localhost:8000' })

let publicOrigin = ''
try {
  const parsed = new URL(publicUrl)
  if (isProduction && parsed.protocol !== 'https:') {
    problems.push('PUBLIC_URL must use https in production')
  }
  publicOrigin = parsed.origin
} catch {
  problems.push('PUBLIC_URL is not a valid URL')
}

export const env = {
  nodeEnv,
  isProduction,
  host: str('HOST', { fallback: '127.0.0.1' }),
  port: int('PORT', 8000, { min: 1, max: 65535 }),
  publicUrl: publicUrl.replace(/\/+$/, ''),
  publicOrigin,
  trustProxy: bool('TRUST_PROXY', false),
  logLevel: str('LOG_LEVEL', { fallback: isProduction ? 'info' : 'debug' }),

  databaseFile: str('DATABASE_FILE', { fallback: resolve(process.cwd(), 'data/openeyes.db') }),
  databaseApiUrl: str('DATABASE_API_URL'),
  databaseApiToken: str('DATABASE_API_TOKEN'),
  apiProviders: Object.fromEntries(Object.keys(process.env).filter((key) => key.startsWith('API_') && key.endsWith('_URL')).map((key) => {
    const id = key.slice(4, -4).toLowerCase().replace(/_/g, '-');
    const tokenKey = key.replace(/_URL$/, '_KEY');
    return [id, { url: process.env[key]?.trim() || '', key: process.env[tokenKey]?.trim() || '' }];
  })),
  staticDir: str('STATIC_DIR'),

  sessionSecret: secret('SESSION_SECRET'),
  sessionIdleSeconds: int('SESSION_IDLE_SECONDS', 60 * 60 * 24 * 7, { min: 300 }),
  sessionAbsoluteSeconds: int('SESSION_ABSOLUTE_SECONDS', 60 * 60 * 24 * 30, { min: 900 }),

  discord: {
    clientId: str('DISCORD_CLIENT_ID'),
    clientSecret: str('DISCORD_CLIENT_SECRET'),
    botToken: str('DISCORD_BOT_TOKEN'),
    guildId: str('DISCORD_GUILD_ID'),
    roleId: str('DISCORD_ROLE_ID'),
    monthlyRoleId: str('DISCORD_MONTHLY_ROLE_ID'),
    lifetimeRoleId: str('DISCORD_LIFETIME_ROLE_ID'),
    redirectUri: str('DISCORD_REDIRECT_URI', { fallback: `${publicUrl.replace(/\/+$/, '')}/api/auth/discord/callback` }),
  },

  chains: {
    btc: {
      enabled: bool('BTC_ENABLED', false),
      xpub: str('BTC_XPUB'),
      hrp: 'bc',
      esploraUrl: str('BTC_ESPLORA_URL'),
      esploraFallbackUrl: str('BTC_ESPLORA_FALLBACK_URL', { fallback: 'https://blockstream.info/api' }),
      confirmations: int('BTC_CONFIRMATIONS', 2, { min: 1, max: 100 }),
    },
    ltc: {
      enabled: bool('LTC_ENABLED', false),
      xpub: str('LTC_XPUB'),
      hrp: 'ltc',
      esploraUrl: str('LTC_ESPLORA_URL'),
      esploraFallbackUrl: str('LTC_ESPLORA_FALLBACK_URL', { fallback: 'https://litecoinspace.org/api' }),
      confirmations: int('LTC_CONFIRMATIONS', 6, { min: 1, max: 100 }),
    },
  },

  rateUrl: str('RATE_URL'),
  rateTtlSeconds: int('RATE_TTL_SECONDS', 300, { min: 30, max: 3600 }),
  invoiceTtlSeconds: int('INVOICE_TTL_SECONDS', 1800, { min: 300, max: 86400 }),
  invoiceUnderpayTolerance: int('INVOICE_UNDERPAY_TOLERANCE_PPM', 2000, { min: 0, max: 50000 }),
  watchIntervalSeconds: int('WATCH_INTERVAL_SECONDS', 30, { min: 10, max: 600 }),
  reconcileIntervalSeconds: int('RECONCILE_INTERVAL_SECONDS', 900, { min: 60, max: 86400 }),

  corsOrigins: list('CORS_ORIGINS'),

  moduleUpstreamUrl: str('MODULE_UPSTREAM_URL'),
  moduleUpstreamToken: str('MODULE_UPSTREAM_TOKEN'),

  ownerUsername: str('OWNER_USERNAME'),
  ownerPassword: str('OWNER_PASSWORD', { required: false }),
  ownerEmail: str('OWNER_EMAIL'),
  adminUsernames: list('ADMIN_USERNAMES'),

  discordShopUrl: str('DISCORD_SHOP_URL'),
  viteDiscordShopUrl: str('VITE_DISCORD_SHOP_URL'),

  admin: {
    ownerIds: list('ADMIN_DISCORD_IDS'),
    totpSecret: str('ADMIN_TOTP_SECRET'),
    ipAllowlist: list('ADMIN_IP_ALLOWLIST'),
    stepUpSeconds: int('ADMIN_STEP_UP_SECONDS', 900, { min: 60, max: 3600 }),
  },
}

if (env.sessionAbsoluteSeconds < env.sessionIdleSeconds) {
  problems.push('SESSION_ABSOLUTE_SECONDS must be at least SESSION_IDLE_SECONDS')
}

for (const [id, chain] of Object.entries(env.chains)) {
  if (!chain.enabled) continue
  if (!chain.xpub) problems.push(`${id.toUpperCase()}_XPUB is required while ${id.toUpperCase()}_ENABLED is true`)
}

for (const id of env.admin.ownerIds) {
  if (!/^\d{5,25}$/.test(id)) problems.push('ADMIN_DISCORD_IDS must be a comma separated list of Discord user ids')
}

if (env.admin.totpSecret) {
  try {
    decodeBase32(env.admin.totpSecret)
  } catch (err) {
    problems.push(`ADMIN_TOTP_SECRET is unusable: ${err.message}`)
  }
}

for (const [name, value] of [
  ['DISCORD_ROLE_ID', env.discord.roleId],
  ['DISCORD_MONTHLY_ROLE_ID', env.discord.monthlyRoleId],
  ['DISCORD_LIFETIME_ROLE_ID', env.discord.lifetimeRoleId],
]) {
  if (value && !/^\d{5,25}$/.test(value)) problems.push(`${name} must be a Discord role id`)
}


export function assertEnv() {
  if (problems.length === 0) return
  const message = ['Refusing to start. Configuration problems:', ...problems.map((p) => `  - ${p}`)].join('\n')
  throw new Error(message)
}

export const envProblems = problems
