import { createHmac, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function decodeBase32(value) {
  const clean = String(value).toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('secret is not valid base32')
  let bits = 0
  let acc = 0
  const out = []
  for (const char of clean) {
    acc = (acc << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  if (out.length < 10) throw new Error('secret is shorter than 80 bits')
  return Buffer.from(out)
}

function codeAt(key, counter) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', key).update(buf).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const value = mac.readUInt32BE(offset) & 0x7fffffff
  return String(value % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function counterNow(at = Date.now()) {
  return Math.floor(at / 1000 / STEP_SECONDS)
}

export function totpCode(secret, at = Date.now()) {
  return codeAt(decodeBase32(secret), counterNow(at))
}

export function verifyTotp(secret, code, { at = Date.now(), window = 1 } = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null
  const key = decodeBase32(secret)
  const centre = counterNow(at)
  const given = Buffer.from(code, 'utf8')
  let match = null
  for (let drift = -window; drift <= window; drift += 1) {
    const counter = centre + drift
    const expected = Buffer.from(codeAt(key, counter), 'utf8')
    if (expected.length === given.length && timingSafeEqual(expected, given)) match = counter
  }
  return match
}
