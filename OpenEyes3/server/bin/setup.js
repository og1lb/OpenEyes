import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const example = resolve(root, '.env.example')
const target = resolve(root, '.env')
const force = process.argv.includes('--force')
const production = process.argv.includes('--production')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32(bytes) {
  let bits = 0
  let acc = 0
  let out = ''
  for (const byte of bytes) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ALPHABET[(acc >> bits) & 31]
    }
  }
  return out
}

if (existsSync(target) && !force) {
  console.log(`${target} already exists. Pass --force to write a fresh one.`)
  process.exit(0)
}

if (!existsSync(example)) {
  console.error('.env.example is missing, cannot build a config from it.')
  process.exit(1)
}

const sessionSecret = randomBytes(32).toString('hex')
const totpSecret = base32(randomBytes(20))

const filled = readFileSync(example, 'utf8')
  .split('\n')
  .map((line) => {
    if (line.startsWith('SESSION_SECRET=')) return `SESSION_SECRET=${sessionSecret}`
    if (line.startsWith('ADMIN_TOTP_SECRET=')) return `ADMIN_TOTP_SECRET=${totpSecret}`
    if (!production && line.startsWith('NODE_ENV=')) return 'NODE_ENV=development'
    if (!production && line.startsWith('PUBLIC_URL=')) return 'PUBLIC_URL=http://localhost:5180'
    return line
  })
  .join('\n')

writeFileSync(target, filled, { mode: 0o600 })

const label = encodeURIComponent('OpenEyes admin')
const uri = `otpauth://totp/${label}?secret=${totpSecret}&issuer=OpenEyes&digits=6&period=30`

console.log(`Wrote ${target} with mode 600.`)
console.log('')
console.log('Admin authenticator secret:')
console.log(`  ${totpSecret}`)
console.log('Add it by hand, or paste this into an authenticator that takes URIs:')
console.log(`  ${uri}`)
console.log('')
console.log('Still to fill in by hand:')
console.log('  DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN')
console.log('  DISCORD_GUILD_ID, DISCORD_MONTHLY_ROLE_ID, DISCORD_LIFETIME_ROLE_ID')
console.log('  ADMIN_DISCORD_IDS   your own Discord user id')
console.log('  BTC_XPUB, LTC_XPUB  account level extended PUBLIC keys')
console.log('  BTC_USD_RATE / LTC_USD_RATE, or RATE_URL')
console.log('')
console.log('Then: npm start')
