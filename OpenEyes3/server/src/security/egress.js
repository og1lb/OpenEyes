import { lookup as dnsLookup } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

// Outbound requests to addresses a user typed in. Every hop is checked where
// it matters, at connect time, so a hostname that resolves to a private range,
// a DNS answer that changes between check and connect, and a redirect into the
// internal network all end in a refusal instead of a request.

const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blocked.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blocked.addSubnet(net, prefix, 'ipv6')
}

function embeddedV4(address) {
  const lower = address.toLowerCase()
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return mapped[1]
  const nat64 = lower.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/)
  if (nat64) return nat64[1]
  return null
}

export function isPublicAddress(address) {
  const family = isIP(address)
  if (family === 0) return false
  if (family === 4) return !blocked.check(address, 'ipv4')
  const v4 = embeddedV4(address)
  if (v4) return !blocked.check(v4, 'ipv4')
  return !blocked.check(address, 'ipv6')
}

export class EgressError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EgressError'
  }
}

function guardedLookup(hostname, options, callback) {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err)
    const usable = addresses.filter((a) => isPublicAddress(a.address))
    if (usable.length === 0 || usable.length !== addresses.length) {
      return callback(new EgressError('that host resolves to a private or reserved address'))
    }
    if (options?.all) return callback(null, usable)
    return callback(null, usable[0].address, usable[0].family)
  })
}

const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8000 },
  headersTimeout: 10000,
  bodyTimeout: 10000,
})

const ALLOWED_PORTS = new Set(['', '80', '443'])

export function checkTarget(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new EgressError('that is not a URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new EgressError('only http and https are allowed')
  if (url.username || url.password) throw new EgressError('URLs with credentials are refused')
  if (!ALLOWED_PORTS.has(url.port)) throw new EgressError('only ports 80 and 443 are allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (isIP(host) && !isPublicAddress(host)) throw new EgressError('that address is private or reserved')
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new EgressError('that host is internal')
  return url
}

async function readCapped(res, maxBytes) {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function safeFetch(raw, { maxRedirects = 3, maxBytes = 256 * 1024, method = 'GET' } = {}) {
  let url = checkTarget(raw)
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let res
    try {
      res = await undiciFetch(url, {
        method,
        redirect: 'manual',
        dispatcher: agent,
        headers: { 'user-agent': 'OpenEyes/1.0 (+fingerprint)', accept: '*/*' },
        signal: AbortSignal.timeout(12000),
      })
    } catch (err) {
      let cause = err
      while (cause) {
        if (cause instanceof EgressError) throw cause
        cause = cause.cause
      }
      throw err
    }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {})
      url = checkTarget(new URL(location, url).toString())
      continue
    }
    const body = method === 'HEAD' ? '' : await readCapped(res, maxBytes)
    return { url: url.toString(), status: res.status, headers: Object.fromEntries(res.headers), body }
  }
  throw new EgressError('too many redirects')
}
