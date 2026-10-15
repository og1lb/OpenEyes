import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const OWNER_ID = '111222333444555666'
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
export const ORIGIN = 'http://127.0.0.1:8123'

Object.assign(process.env, {
  OPENEYES_ENV_FILE: join(mkdtempSync(join(tmpdir(), 'openeyes-test-')), 'absent.env'),
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: '8123',
  PUBLIC_URL: ORIGIN,
  DATABASE_FILE: join(mkdtempSync(join(tmpdir(), 'openeyes-test-')), 'is.db'),
  SESSION_SECRET: '4f8a2c9e1b7d6035aa4419ce82f7d1b03e5c6a9948d2710f',
  DISCORD_CLIENT_ID: '111111111111111111',
  DISCORD_CLIENT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  DISCORD_BOT_TOKEN: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  DISCORD_GUILD_ID: '222222222222222222',
  DISCORD_ROLE_ID: '333333333333333333',
  BTC_XPUB:
    'xpub6D2Ghf9ptWKkFYA5SJb9s1YuPion5W75n4Pd2GvTeAX595XqEktwGpBEL9UK38cQvioxW3KWzhXqMMhjCi4K3eo9kXWfZEXjPRZt5npou4j',
  LTC_XPUB:
    'xpub6BhJq1ZAnfSLtDtx6T2GePfptyj5cZdTnVF7YZVj4PcJ2Jkr6gK2Fw2ZhfofmHcoz5gBdvVZdZGqUHYz58chfSLYyqN7ACPaUdxV9iYy7QW',
  BTC_USD_RATE: '64000',
  LTC_USD_RATE: '72',
  WATCH_INTERVAL_SECONDS: '600',
  RECONCILE_INTERVAL_SECONDS: '3600',
  ADMIN_DISCORD_IDS: OWNER_ID,
  ADMIN_TOTP_SECRET: TOTP_SECRET,
  OWNER_USERNAME: 'owner',
  OWNER_PASSWORD: 'change-this-to-a-long-random-password',
  OWNER_EMAIL: 'owner@example.com',
  ADMIN_USERNAMES: 'admin',
})

const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = String(input?.url ?? input)
  if (url.includes('discord.com')) throw new Error('discord is offline in tests')
  return realFetch(input, init)
}
