import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function randomId(bytes = 16) {
  return randomBytes(bytes).toString('hex')
}

export function sha256(value) {
  return createHash('sha256').update(value).digest()
}

export function keyedHash(value, purpose) {
  return createHmac('sha256', env.sessionSecret).update(`${purpose}:${value}`).digest()
}

export function equal(a, b) {
  if (typeof a === 'string') a = Buffer.from(a, 'utf8')
  if (typeof b === 'string') b = Buffer.from(b, 'utf8')
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false
  const left = sha256(a)
  const right = sha256(b)
  return timingSafeEqual(left, right)
}

export function pkcePair() {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}
