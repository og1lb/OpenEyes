import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { safeFetch } from './security/egress.js'

const DOH = 'https://cloudflare-dns.com/dns-query'
const RIPE = 'https://stat.ripe.net/data'
const MAX_JSON = 2 * 1024 * 1024

export class LookupError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'LookupError'
    this.statusCode = statusCode
  }
}

async function getJson(url, { headers = {} } = {}) {
  let res
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { accept: 'application/json', 'user-agent': 'OpenEyes/1.0', ...headers },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new LookupError('The source did not answer.', 502)
  }
  const text = await res.text()
  if (text.length > MAX_JSON) throw new LookupError('The source answered with too much data.', 502)
  try {
    return { status: res.status, json: JSON.parse(text) }
  } catch {
    throw new LookupError('The source is unavailable right now.', 502)
  }
}

const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/

function text(value, max = 512) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function flag(value, fallback) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return fallback
}

function num(value, fallback, min, max) {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

function domainOf(value) {
  const d = text(value, 253).toLowerCase().replace(/\.$/, '')
  if (!DOMAIN.test(d)) throw new LookupError('That is not a valid domain name.')
  return d
}

function list(value) {
  if (Array.isArray(value)) return value.map((v) => text(v, 32)).filter(Boolean)
  return text(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

async function doh(name, type) {
  const { json } = await getJson(`${DOH}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, {
    headers: { accept: 'application/dns-json' },
  })
  return Array.isArray(json?.Answer) ? json.Answer : []
}

async function reverseDns(ip) {
  if (isIP(ip) !== 4) return []
  const name = ip.split('.').reverse().join('.') + '.in-addr.arpa'
  const ans = await doh(name, 'PTR')
  return ans.map((a) => String(a.data).replace(/\.$/, ''))
}

function dshort(v) {
  return v ? String(v).slice(0, 10) : '—'
}

async function ipLookup(v) {
  const ip = text(v.ip, 64)
  if (!isIP(ip)) throw new LookupError('Give a valid IPv4 or IPv6 address.')
  const { json: j } = await getJson('https://ipwho.is/' + encodeURIComponent(ip))
  if (!j?.success) throw new LookupError(j?.message ? String(j.message).slice(0, 200) : 'That address did not resolve.', 502)
  const c = j.connection || {}
  return {
    blocks: {
      network: {
        address: j.ip,
        asn: c.asn ? 'AS' + c.asn : '—',
        org: c.org || c.isp || '—',
        isp: c.isp || '—',
        type: j.type || '—',
      },
      geo: {
        country: [j.country, j.country_code && `(${j.country_code})`].filter(Boolean).join(' ') || '—',
        region: j.region || '—',
        city: j.city || '—',
        timezone: j.timezone?.id || '—',
      },
      reverse: flag(v.reverse, true) ? await reverseDns(j.ip) : [],
    },
  }
}

async function asnLookup(v) {
  const n = text(v.asn, 16).replace(/^as/i, '')
  if (!/^\d{1,10}$/.test(n)) throw new LookupError('Give an AS number, e.g. AS13335.')
  const { json: meta } = await getJson(`${RIPE}/as-overview/data.json?resource=AS${n}`)
  const d = meta?.data || {}
  const registry = {
    asn: 'AS' + n,
    holder: d.holder || '—',
    announced: d.announced ? 'yes' : 'no',
    block: d.block?.resource || '—',
    block_name: d.block?.name || '—',
    type: d.type || '—',
  }

  let prefixes = []
  if (flag(v.prefixes, true)) {
    const { json: p } = await getJson(`${RIPE}/announced-prefixes/data.json?resource=AS${n}`)
    prefixes = (p?.data?.prefixes || []).slice(0, 200).map((x) => ({
      prefix: x.prefix,
      family: String(x.prefix).includes(':') ? 'IPv6' : 'IPv4',
      description: '—',
      country: '—',
    }))
  }

  let peers = []
  if (flag(v.peers, false)) {
    const { json: pr } = await getJson(`${RIPE}/asn-neighbours/data.json?resource=AS${n}`)
    peers = (pr?.data?.neighbours || []).slice(0, 100).map((x) => ({
      asn: 'AS' + x.asn,
      name: '—',
      relation: x.type || 'peer',
    }))
  }
  return { blocks: { registry, prefixes, peers } }
}

function registrarName(j) {
  const e = (j.entities || []).find((x) => (x.roles || []).includes('registrar'))
  const card = e?.vcardArray?.[1] || []
  const fn = card.find((x) => x[0] === 'fn')
  return fn ? fn[3] : '—'
}

const RECORD_TYPES = new Set(['A', 'AAAA', 'MX', 'NS', 'TXT', 'SOA', 'CNAME', 'CAA', 'SRV'])

async function domainRecon(v) {
  const domain = domainOf(v.domain)
  const asked = list(v.records).map((t) => t.toUpperCase()).filter((t) => RECORD_TYPES.has(t))
  const types = asked.length ? asked : ['A', 'AAAA', 'MX', 'NS', 'TXT']
  const records = []
  for (const t of types) {
    for (const a of await doh(domain, t)) records.push({ type: t, name: domain, value: a.data, ttl: a.TTL })
  }

  let registration = { domain }
  let nameservers = []
  try {
    const { status, json: j } = await getJson('https://www.rdap.net/domain/' + encodeURIComponent(domain), {
      headers: { accept: 'application/rdap+json' },
    })
    if (status === 200 && j) {
      const ev = Object.fromEntries((j.events || []).map((e) => [e.eventAction, e.eventDate]))
      registration = {
        domain,
        registrar: registrarName(j),
        created: dshort(ev.registration),
        updated: dshort(ev['last changed']),
        expires: dshort(ev.expiration),
        status: (j.status || []).join(', ') || '—',
        dnssec: j.secureDNS?.delegationSigned ? 'signed' : 'unsigned',
      }
      nameservers = (j.nameservers || []).map((ns) => ns.ldhName).filter(Boolean)
    }
  } catch {
    registration = { domain, note: 'RDAP did not answer' }
  }
  if (!nameservers.length) nameservers = records.filter((r) => r.type === 'NS').map((r) => String(r.value).replace(/\.$/, ''))

  return { blocks: { registration, records, nameservers } }
}

async function subdomainEnum(v) {
  const domain = domainOf(v.domain)
  const { status, json: rows } = await getJson(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`)
  if (status !== 200 || !Array.isArray(rows)) throw new LookupError('crt.sh did not answer.', 502)
  const set = new Set()
  for (const row of rows) {
    for (const nm of String(row.name_value || '').split('\n')) {
      const h = nm.trim().toLowerCase()
      if (h && !h.startsWith('*') && (h === domain || h.endsWith('.' + domain))) set.add(h)
    }
  }
  const cap = num(v.limit, 200, 10, 5000)
  const hosts = [...set].slice(0, cap).map((h) => ({ host: h, address: '', source: 'crt.sh', status: '' }))
  if (flag(v.resolve, true)) {
    for (const row of hosts.slice(0, 30)) {
      const a = await doh(row.host, 'A')
      row.address = a.length ? a[0].data : ''
      row.status = a.length ? 'resolved' : 'no A'
    }
  }
  return {
    blocks: {
      summary: { domain, found: set.size, shown: hosts.length, source: 'crt.sh certificate transparency' },
      hosts,
    },
  }
}

const STACK_HINTS = [
  ['server', 'server', 'high'],
  ['x-powered-by', 'runtime', 'high'],
  ['x-generator', 'cms', 'medium'],
  ['x-aspnet-version', 'runtime', 'high'],
]

async function webFingerprint(v) {
  const raw = text(v.url, 2048)
  if (!raw) throw new LookupError('Give a URL.')
  const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw

  let res
  try {
    res = await safeFetch(url, { maxRedirects: flag(v.follow, true) ? 3 : 0, maxBytes: 64 * 1024 })
  } catch (err) {
    throw new LookupError(err.name === 'EgressError' ? err.message : 'That site did not answer.', err.name === 'EgressError' ? 400 : 502)
  }

  const headers = res.headers
  const stack = []
  for (const [header, category, confidence] of STACK_HINTS) {
    if (headers[header]) stack.push({ name: String(headers[header]).slice(0, 120), category, version: '', confidence })
  }
  if (headers['cf-ray'] || /cloudflare/i.test(headers.server || '')) stack.push({ name: 'Cloudflare', category: 'cdn', version: '', confidence: 'high' })

  let robots = '(none)'
  try {
    const r = await safeFetch(new URL('/robots.txt', res.url).toString(), { maxRedirects: 2, maxBytes: 8 * 1024 })
    if (r.status === 200 && /text\/plain/i.test(r.headers['content-type'] || '')) robots = r.body.slice(0, 2000)
  } catch {
    robots = '(none)'
  }

  const final = new URL(res.url)
  return {
    blocks: {
      response: { url: res.url, status: res.status, tls: final.protocol === 'https:' ? 'yes' : 'no' },
      stack,
      headers,
      robots,
    },
  }
}

function hashToolkit(v) {
  const s = text(v.hash, 256)
  if (!s) throw new LookupError('Give a hash.')
  const hex = /^[a-f0-9]+$/i.test(s)
  let likely = 'unknown'
  let also = []
  if (s.startsWith('$2')) likely = 'bcrypt'
  else if (s.startsWith('$argon2')) likely = 'Argon2'
  else if (s.startsWith('$6$')) likely = 'sha512crypt'
  else if (s.startsWith('$5$')) likely = 'sha256crypt'
  else if (s.startsWith('$1$')) likely = 'md5crypt'
  else if (hex) {
    const table = {
      32: ['MD5', ['NTLM', 'MD4', 'LM']],
      40: ['SHA-1', ['RIPEMD-160']],
      56: ['SHA-224', []],
      64: ['SHA-256', ['SHA3-256', 'BLAKE2s']],
      96: ['SHA-384', []],
      128: ['SHA-512', ['SHA3-512', 'Whirlpool']],
    }
    if (table[s.length]) [likely, also] = table[s.length]
  }
  const compare = text(v.compare, 256)
  const identity = { hash: s, length: s.length, charset: hex ? 'hex' : 'mixed', likely, also: also.join(', ') || '—' }
  if (compare) identity.matches_compare = compare.toLowerCase() === s.toLowerCase() ? 'yes' : 'no'
  return { blocks: { identity, intel: [] } }
}

async function emailIntel(v) {
  const email = text(v.email, 254)
  const m = email.match(/^[^@\s]{1,64}@([^@\s]+)$/)
  let domain = ''
  if (m) {
    try {
      domain = domainOf(m[1])
    } catch {
      domain = ''
    }
  }
  const mxAns = domain ? await doh(domain, 'MX') : []
  const mx = mxAns
    .map((a) => {
      const parts = String(a.data).split(' ')
      return { host: parts.slice(1).join(' ').replace(/\.$/, ''), priority: Number(parts[0]), reachable: 'unknown' }
    })
    .sort((a, b) => a.priority - b.priority)
  return {
    blocks: {
      validation: {
        address: email,
        syntax: domain ? 'valid' : 'invalid',
        domain: domain || '—',
        has_mx: mx.length ? 'yes' : 'no',
        disposable: 'unknown',
      },
      mx,
      accounts: [],
    },
  }
}

async function mailPosture(v) {
  const domain = domainOf(v.domain)
  const txt = (await doh(domain, 'TXT')).map((a) => String(a.data).replace(/^"|"$/g, ''))
  const spf = txt.find((t) => /^v=spf1/i.test(t)) || ''
  const dmarc =
    (await doh('_dmarc.' + domain, 'TXT')).map((a) => String(a.data).replace(/"/g, '')).find((t) => /v=DMARC1/i.test(t)) || ''
  const policy = (dmarc.match(/p=(\w+)/) || [])[1] || 'none'
  const records = [
    { type: 'SPF', value: spf || 'missing', status: spf ? (/-all/.test(spf) ? 'strict' : 'soft') : 'missing' },
    { type: 'DMARC', value: dmarc || 'missing', status: dmarc ? policy : 'missing' },
  ]
  for (const sel of list(v.selectors).slice(0, 10)) {
    if (!/^[a-z0-9-]{1,63}$/i.test(sel)) continue
    const dk = await doh(`${sel}._domainkey.${domain}`, 'TXT')
    records.push({ type: 'DKIM ' + sel, value: dk.length ? 'present' : 'missing', status: dk.length ? 'ok' : 'missing' })
  }
  return {
    blocks: {
      verdict: {
        domain,
        spoofable: policy === 'reject' || policy === 'quarantine' ? 'no' : 'yes',
        dmarc_policy: policy,
        spf: spf ? 'present' : 'missing',
      },
      records,
    },
  }
}

function ibanCheck(v) {
  const iban = text(v.iban, 64).replace(/\s+/g, '').toUpperCase()
  const shaped = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)
  let valid = false
  if (shaped) {
    const num = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55)
    let rem = 0
    for (const d of num) rem = (rem * 10 + Number(d)) % 97
    valid = rem === 1
  }
  return {
    blocks: {
      validation: {
        iban: iban || '—',
        valid: valid ? 'yes' : 'no',
        checksum: valid ? 'passed' : 'failed',
        country: iban.slice(0, 2) || '—',
        account: iban.slice(4) || '—',
      },
      bank: { note: 'Naming the bank needs a BIC directory, which is not connected.' },
    },
  }
}

function fmtTs(ts) {
  const s = String(ts || '')
  if (s.length < 8) return s
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
}

async function wayback(v) {
  const q = text(v.url, 2048)
  if (!q) throw new LookupError('Give a URL or domain.')
  const params = new URLSearchParams({ url: q, output: 'json', limit: '200', collapse: 'digest' })
  const from = text(v.from, 14)
  const to = text(v.to, 14)
  if (/^\d{4,14}$/.test(from)) params.set('from', from)
  if (/^\d{4,14}$/.test(to)) params.set('to', to)
  const { status, json: rows } = await getJson(`https://web.archive.org/cdx/search/cdx?${params}`)
  if (status !== 200 || !Array.isArray(rows)) throw new LookupError('The Wayback Machine did not return data.', 502)
  const head = rows.shift() || []
  const ti = head.indexOf('timestamp')
  const captures = rows
    .slice(-100)
    .reverse()
    .map((row) => {
      const o = Object.fromEntries(head.map((k, i) => [k, row[i]]))
      return {
        timestamp: fmtTs(o.timestamp),
        status: o.statuscode,
        length: o.length,
        url: `https://web.archive.org/web/${o.timestamp}/${o.original}`,
      }
    })
  return {
    blocks: {
      summary: {
        url: q,
        captures: rows.length,
        first: rows.length ? fmtTs(rows[0][ti]) : '—',
        last: rows.length ? fmtTs(rows[rows.length - 1][ti]) : '—',
      },
      captures,
    },
  }
}

const IFD_TAGS = { 0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x0132: 'DateTime', 0x0112: 'Orientation' }
const EXIF_TAGS = {
  0x9003: 'DateTimeOriginal',
  0x829a: 'ExposureTime',
  0x829d: 'FNumber',
  0x8827: 'ISO',
  0x920a: 'FocalLength',
  0xa002: 'PixelXDimension',
  0xa003: 'PixelYDimension',
}
const GPS_TAGS = { 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude', 0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude' }
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

function readEntry(dv, base, entryOff, le) {
  const tag = dv.getUint16(entryOff, le)
  const type = dv.getUint16(entryOff + 2, le)
  const count = dv.getUint32(entryOff + 4, le)
  const total = (TYPE_SIZE[type] || 1) * Math.min(count, 1 << 16)
  const valOff = total > 4 ? base + dv.getUint32(entryOff + 8, le) : entryOff + 8
  if (valOff + total > dv.byteLength) throw new Error('entry points outside the file')
  return { tag, type, count: Math.min(count, 1 << 16), valOff }
}

function decode(dv, e, le) {
  const { type, count, valOff } = e
  if (type === 2) {
    let s = ''
    for (let i = 0; i < Math.min(count, 256); i++) {
      const c = dv.getUint8(valOff + i)
      if (!c) break
      s += String.fromCharCode(c)
    }
    return s.trim()
  }
  const rd = (o) => (type === 3 ? dv.getUint16(o, le) : type === 10 ? dv.getInt32(o, le) : dv.getUint32(o, le))
  if (type === 3 || type === 4) {
    const a = []
    for (let i = 0; i < Math.min(count, 16); i++) a.push(rd(valOff + i * (type === 3 ? 2 : 4)))
    return a.length === 1 ? a[0] : a
  }
  if (type === 5 || type === 10) {
    const a = []
    for (let i = 0; i < Math.min(count, 16); i++) {
      const n = rd(valOff + i * 8)
      const d = rd(valOff + i * 8 + 4)
      a.push(d ? n / d : 0)
    }
    return a.length === 1 ? a[0] : a
  }
  return dv.getUint8(valOff)
}

function formatGps(g) {
  if (!Array.isArray(g.GPSLatitude) || !Array.isArray(g.GPSLongitude)) return null
  const dms = (a) => a[0] + a[1] / 60 + a[2] / 3600
  let lat = dms(g.GPSLatitude)
  let lon = dms(g.GPSLongitude)
  if (g.GPSLatitudeRef === 'S') lat = -lat
  if (g.GPSLongitudeRef === 'W') lon = -lon
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { latitude: lat.toFixed(6), longitude: lon.toFixed(6) }
}

function readIfd(dv, base, ifdOff, le, out, group, map, depth) {
  if (depth > 3) return
  const abs = base + ifdOff
  if (abs + 2 > dv.byteLength) return
  const n = Math.min(dv.getUint16(abs, le), 256)
  for (let i = 0; i < n; i++) {
    const e = readEntry(dv, base, abs + 2 + i * 12, le)
    const val = decode(dv, e, le)
    if (e.tag === 0x8769 && typeof val === 'number') {
      readIfd(dv, base, val, le, out, 'EXIF', EXIF_TAGS, depth + 1)
      continue
    }
    if (e.tag === 0x8825 && typeof val === 'number') {
      const graw = {}
      const gAbs = base + val
      if (gAbs + 2 > dv.byteLength) continue
      const gn = Math.min(dv.getUint16(gAbs, le), 64)
      for (let k = 0; k < gn; k++) {
        const ge = readEntry(dv, base, gAbs + 2 + k * 12, le)
        if (GPS_TAGS[ge.tag]) graw[GPS_TAGS[ge.tag]] = decode(dv, ge, le)
      }
      out.gps = formatGps(graw)
      continue
    }
    const name = map[e.tag]
    if (name && out.tags.length < 64) out.tags.push({ group, tag: name, value: String(val).slice(0, 200) })
  }
}

function parseExif(bytes) {
  const out = { tags: [], gps: null }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return out
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let off = 2
  let guard = 0
  while (off < bytes.length - 4 && guard++ < 512) {
    if (bytes[off] !== 0xff) break
    const marker = bytes[off + 1]
    if (marker === 0xda) break
    const size = dv.getUint16(off + 2)
    if (marker === 0xe1 && String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]) === 'Exif') {
      const base = off + 10
      const le = dv.getUint16(base) === 0x4949
      readIfd(dv, base, dv.getUint32(base + 4, le), le, out, 'IFD0', IFD_TAGS, 0)
      break
    }
    off += 2 + size
  }
  return out
}

function humanSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function metadata(v) {
  const file = v.file
  if (!file || !Buffer.isBuffer(file.data)) throw new LookupError('No file uploaded.')
  const bytes = new Uint8Array(file.data)
  let exif = { tags: [], gps: null }
  try {
    exif = parseExif(bytes)
  } catch {
    exif = { tags: [], gps: null }
  }
  return {
    blocks: {
      file: {
        name: String(file.filename || 'upload').replace(/[^\w.\- ]/g, '_').slice(0, 120),
        size: humanSize(bytes.length),
        type: String(file.mimetype || '—').slice(0, 80),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      exif: exif.tags,
      gps: exif.gps || { note: 'No GPS tags, or the format carries none.' },
    },
  }
}

async function syntheticTest(v) {
  if (String(v.email || '').toLowerCase() !== 'test@example.com') throw new LookupError('Use the synthetic test object test@example.com.')
  return { blocks: { notice: 'SYNTHETIC TEST DATA', domains: ['example.invalid','test.invalid'], passwords: ['synthetic-test-password-1','synthetic-test-password-2'], usernames: ['test_user','example_test'] } }
}



async function binLookup(v) {
  const bin = text(v.bin, 11).replace(/\D/g, '').slice(0, 8)
  if (!/^\d{6,8}$/.test(bin)) throw new LookupError('Give the first 6–8 digits of a card (BIN only).')
  const { status, json: j } = await getJson(`https://cardbincheck.com/api/bin/${bin}`)
  if (status !== 200 || !j) throw new LookupError('The BIN source did not answer.', 502)
  return { blocks: { card: {
    bin,
    scheme: j.scheme || j.network || '—',
    brand: j.brand || '—',
    type: j.type || '—',
    category: j.card_category || j.segment || '—',
    prepaid: j.prepaid == null ? '—' : String(j.prepaid),
  }, issuer: {
    bank: j.bank?.name || j.issuer?.name || '—',
    country: j.country?.name || j.country_name || '—',
    country_code: j.country?.alpha2 || j.country_code || '—',
    website: j.bank?.url || j.issuer?.website || '—',
    phone: j.bank?.phone || j.issuer?.phone || '—',
  } } }
}

async function walletTrace(v) {
  const address = text(v.address, 128)
  const chain = String(v.chain || 'AUTO').toUpperCase()
  if (!address) throw new LookupError('Give a wallet address.')
  if (!['AUTO', 'BTC'].includes(chain)) {
    throw new LookupError('The free wallet adapter currently supports Bitcoin through mempool.space. Add another chain provider later.')
  }
  const { status, json: j } = await getJson(`https://mempool.space/api/address/${encodeURIComponent(address)}`)
  if (status !== 200 || !j?.address) throw new LookupError('That Bitcoin address was not found.', 502)
  const txLimit = num(v.transactions, 25, 0, 50)
  const txs = txLimit ? (await getJson(`https://mempool.space/api/address/${encodeURIComponent(address)}/txs`)).json : []
  const stats = j.chain_stats || {}
  const btc = n => (Number(n || 0) / 100000000).toFixed(8) + ' BTC'
  return { blocks: {
    wallet: {
      address: j.address,
      chain: 'BTC',
      funded: btc(stats.funded_txo_sum),
      spent: btc(stats.spent_txo_sum),
      balance: btc(Number(stats.funded_txo_sum || 0) - Number(stats.spent_txo_sum || 0)),
      transactions: stats.tx_count ?? '—',
    },
    labels: [],
    transactions: Array.isArray(txs) ? txs.slice(0, txLimit).map(tx => ({
      time: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'mempool',
      direction: tx.vin?.some(x => x.prevout?.scriptpubkey_address === address) ? 'out' : 'in',
      amount: btc((tx.vout || []).filter(x => x.scriptpubkey_address === address).reduce((a,x)=>a+Number(x.value||0),0)),
      counterparty: tx.txid,
    })) : [],
  } }
}

async function phoneLookup(v) {
  const phone = text(v.phone, 64)
  const digits = phone.replace(/[^0-9+]/g, '')
  if (!/^\+?\d{7,15}$/.test(digits)) throw new LookupError('Give a valid international phone number.')
  const normalized = digits.startsWith('+') ? digits : '+' + digits
  if (/^\+1\d{10}$/.test(normalized)) {
    const raw = normalized.slice(2)
    const { status, json: j } = await getJson(`https://www.usacallerlookup.com/wp-json/ucl/v1/number/${raw}`)
    if (status === 200 && j) return { blocks: {
      number: { normalized, country: 'US', carrier: j.carrier || '—', city: j.city || '—', state: j.state || '—' },
      reputation: { complaints: j.complaints ?? 0, robocall: j.robocall ?? false, first_reported: j.first_reported || '—', last_reported: j.last_reported || '—' },
    } }
  }
  return { blocks: { number: { normalized, country: String(v.region || 'AUTO'), carrier: 'unknown', city: 'unknown', state: 'unknown' }, reputation: { note: 'No free keyless public carrier/complaint source is available for this region; normalized locally.' } } }
}

async function breachSearch(v) {
  const email = text(v.email, 254).toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new LookupError('Give a valid email address.')
  const { status, json: j } = await getJson(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}?details=true`)
  if (status === 404 || j?.Error === 'Not found') return { blocks: { summary: { email, found: 'no', source: 'XposedOrNot' }, breaches: [] } }
  if (status !== 200 || !j) throw new LookupError('The free breach source did not answer.', 502)
  const raw = Array.isArray(j.breaches) ? j.breaches.flat(Infinity) : []
  const names = [...new Set(raw.filter(x => typeof x === 'string'))]
  return { blocks: { summary: { email, found: names.length ? 'yes' : 'no', count: names.length, source: 'XposedOrNot' }, breaches: names.map(name => ({ breach: name })) } }
}

async function usernameSweep(v) {
  const username = text(v.username, 80).replace(/^@/, '')
  if (!/^[a-zA-Z0-9._-]{2,80}$/.test(username)) throw new LookupError('Give a valid username.')
  const profiles = []
  const checks = [
    ['GitHub', `https://api.github.com/users/${encodeURIComponent(username)}`, j => ({ url: j.html_url, status: 'registered', checked: 'public_api' })],
    ['GitLab', `https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`, j => ({ url: Array.isArray(j) && j[0]?.web_url, status: Array.isArray(j) && j.length ? 'registered' : 'not_found', checked: 'public_api' })],
    ['Stack Overflow', `https://api.stackexchange.com/2.3/users?inname=${encodeURIComponent(username)}&site=stackoverflow`, j => ({ url: Array.isArray(j?.items) && j.items[0]?.link, status: Array.isArray(j?.items) && j.items.length ? 'registered' : 'not_found', checked: 'public_api' })],
    ['Reddit', `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, j => ({ url: j?.data?.subreddit?.url ? `https://www.reddit.com/user/${username}/` : `https://www.reddit.com/user/${username}/`, status: j?.data ? 'registered' : 'not_found', checked: 'public_json' })],
  ]
  for (const [platform, url, parse] of checks) {
    try {
      const { status, json } = await getJson(url, { headers: { 'user-agent': 'OpenEyes/1.0 public-research-client' } })
      const parsed = parse(json)
      profiles.push({ platform, url: parsed.url || `https://${platform.toLowerCase().replace(/\s+/g,'')}.com/${username}`, status: status === 200 && parsed.status === 'registered' ? 'registered' : parsed.status, checked: parsed.checked })
    } catch { profiles.push({ platform, url: '—', status: 'unknown', checked: 'source_unavailable' }) }
  }
  return { blocks: { summary: { username, matches: profiles.filter(x => x.status === 'registered').length, sources: profiles.length }, profiles } }
}

async function portSweep(v) {
  const host = text(v.host, 253)
  if (!host) throw new LookupError('Give an IP address or hostname.')
  let ip = host
  if (!isIP(ip)) {
    const a = await doh(host, 'A')
    ip = a[0]?.data || ''
  }
  if (!isIP(ip)) throw new LookupError('The host did not resolve to an IP address.')
  const { status, json: j } = await getJson(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`)
  if (status !== 200 || !j) throw new LookupError('InternetDB did not answer.', 502)
  const ports = Array.isArray(j.ports) ? j.ports : []
  return { blocks: { summary: { host, ip, source: 'Shodan InternetDB', passive: 'yes', ports: ports.length }, ports: ports.map(port => ({ port, protocol: 'tcp', service: 'InternetDB', banner: '—' })), hostnames: j.hostnames || [], vulnerabilities: j.vulns || [] } }
}

function parseJsonScript(html, id) {
  const re = new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)</script>`, 'i')
  const m = html.match(re)
  if (!m) return null
  try { return JSON.parse(m[1].trim()) } catch { return null }
}

function firstMeta(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']*)["']`, 'i')
  const m = html.match(re)
  return m ? m[1] : ''
}

function tiktokHandle(value) {
  const raw = text(value, 128).replace(/^@/, '')
  const fromUrl = raw.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i)
  const handle = fromUrl ? fromUrl[1] : raw
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(handle)) throw new LookupError('Give a public TikTok username.')
  return handle
}

function walkObject(root, predicate, limit=20) {
  const out=[]; const seen=new Set(); const stack=[root]
  while(stack.length && out.length<limit){ const cur=stack.pop(); if(!cur||typeof cur!=='object'||seen.has(cur)) continue; seen.add(cur); if(predicate(cur)) out.push(cur); if(Array.isArray(cur)) for(let i=cur.length-1;i>=0;i--) stack.push(cur[i]); else for(const v of Object.values(cur)) stack.push(v) }
  return out
}

async function tiktokPublicProfile(v) {
  const username=tiktokHandle(v.username)
  const url=`https://www.tiktok.com/@${encodeURIComponent(username)}`
  const res=await safeFetch(url,{maxRedirects:4,maxBytes:1024*1024})
  if(res.status===404) throw new LookupError('TikTok profile not found.',404)
  if(res.status<200||res.status>=400) throw new LookupError(`TikTok returned HTTP ${res.status}.`,502)
  const html=res.body
  const title=firstMeta(html,'og:title') || firstMeta(html,'twitter:title')
  const description=firstMeta(html,'og:description') || firstMeta(html,'description')
  const image=firstMeta(html,'og:image')
  const data=parseJsonScript(html,'__UNIVERSAL_DATA_FOR_REHYDRATION__') || parseJsonScript(html,'SIGI_STATE')
  const candidates=walkObject(data, o => typeof o.uniqueId==='string' && (o.uniqueId.toLowerCase()===username.toLowerCase() || typeof o.nickname==='string'), 10)
  const profile=candidates[0]||{}
  const stats=profile.stats||profile.statistics||{}
  const user=profile.user||profile.author||profile
  return {blocks:{profile:{username:user.uniqueId||username,display_name:user.nickname||title?.replace(/\s*\|.*$/,'')||'—',verified:user.verified===true?'yes':'no',bio:user.signature||description||'—',avatar:user.avatarLarger||user.avatarMedium||image||'—'},stats:{followers:stats.followerCount??'—',following:stats.followingCount??'—',likes:stats.heartCount??stats.heart??'—',videos:stats.videoCount??'—'},source:{url:res.url,visibility:'public page only',note:'No private, login-gated, or anti-bot data is accessed.'}}}
}

async function tiktokPublicVideo(v) {
  const raw=text(v.url,512)
  if(!/^https?:\/\/(www\.)?tiktok\.com\//i.test(raw)) throw new LookupError('Give a public TikTok video URL.')
  const res=await safeFetch(raw,{maxRedirects:5,maxBytes:1024*1024})
  if(res.status<200||res.status>=400) throw new LookupError(`TikTok returned HTTP ${res.status}.`,502)
  const html=res.body
  const title=firstMeta(html,'og:title')||firstMeta(html,'twitter:title')
  const description=firstMeta(html,'og:description')||firstMeta(html,'description')
  const image=firstMeta(html,'og:image')
  const canonical=firstMeta(html,'og:url')||res.url
  const jsonLd=parseJsonScript(html,'__NEXT_DATA__')
  const stats=walkObject(jsonLd,o=>o.playCount!==undefined||o.diggCount!==undefined||o.commentCount!==undefined,5)[0]||{}
  return {blocks:{video:{url:canonical,title:title||'—',description:description||'—',thumbnail:image||'—',views:stats.playCount??'—',likes:stats.diggCount??'—',comments:stats.commentCount??'—',shares:stats.shareCount??'—'},source:{visibility:'public page only',note:'Metadata is read from the public page; no login or private endpoint is used.'}}}
}


async function tiktokPublic(v) {
  const raw = text(v.query, 512).trim()
  if (/^https?:\/\/(www\.)?tiktok\.com\//i.test(raw)) {
    // Video URLs contain /video/; profile URLs can be pasted as well.
    if (/\/video\//i.test(new URL(raw).pathname)) return tiktokPublicVideo({ url: raw })
    const match = new URL(raw).pathname.match(/^\/@([^/]+)/)
    if (match) return tiktokPublicProfile({ username: match[1] })
    throw new LookupError('Use a TikTok profile URL or a video URL containing /video/.')
  }
  return tiktokPublicProfile({ username: raw.replace(/^@/, '') })
}

async function githubIntel(v) {
  const username = text(v.username, 39).replace(/^@/, '')
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) throw new LookupError('Give a valid GitHub username.')
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'OpenEyes-OSINT/1.0' }
  const [userRes, repoRes, eventsRes] = await Promise.all([
    getJson(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
    getJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`, { headers }),
    getJson(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`, { headers }),
  ])
  if (userRes.status === 404) throw new LookupError('GitHub user was not found.', 404)
  if (userRes.status !== 200) throw new LookupError(`GitHub API returned HTTP ${userRes.status}.`, 502)
  const u = userRes.json || {}
  const repos = Array.isArray(repoRes.json) ? repoRes.json : []
  const events = Array.isArray(eventsRes.json) ? eventsRes.json : []
  const emailRows = []
  if (typeof u.email === 'string' && u.email.includes('@')) emailRows.push({ email: u.email, source: 'Public GitHub profile', date: '—', url: u.html_url })
  for (const event of events) {
    for (const commit of (event?.payload?.commits || [])) {
      const email = commit?.author?.email
      if (typeof email === 'string' && email.includes('@') && !email.endsWith('@users.noreply.github.com')) emailRows.push({ email, source: 'Public event commit metadata', date: event.created_at || '—', url: event.repo?.url ? event.repo.url.replace('api.github.com/repos/', 'github.com/') : u.html_url })
    }
  }
  const uniqueEmails = [...new Map(emailRows.map(row => [row.email.toLowerCase(), row])).values()].slice(0, 50)
  return { blocks: {
    profile: { username: u.login, name: u.name || '—', bio: u.bio || '—', company: u.company || '—', location: u.location || '—', blog: u.blog || '—', created: u.created_at || '—', updated: u.updated_at || '—', profile_url: u.html_url, public_repos: u.public_repos, followers: u.followers, following: u.following, public_gists: u.public_gists, hireable: u.hireable === true ? 'yes' : 'no' },
    repositories: repos.map(r => ({ name: r.name, language: r.language || '—', stars: r.stargazers_count, forks: r.forks_count, visibility: r.private ? 'private' : 'public', updated: r.updated_at, url: r.html_url, description: r.description || '—' })),
    emails: uniqueEmails.map(row => ({ ...row })),
    source: { provider: 'GitHub REST API', note: 'Only email addresses explicitly public on the profile or present in public event commit metadata are shown. GitHub may hide email addresses; an empty list does not mean none exist.', profile_email: u.email ? 'public profile email available' : 'no public profile email', events_status: eventsRes.status === 200 ? 'loaded' : `HTTP ${eventsRes.status}`, repo_status: repoRes.status === 200 ? 'loaded' : `HTTP ${repoRes.status}` }
  } }
}

async function urlscanIntel(v) {
  const domain = domainOf(v.domain)
  const { status, json } = await getJson(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent('domain:' + domain)}&size=50`, { headers: { accept: 'application/json' } })
  if (status !== 200) throw new LookupError(`urlscan.io returned HTTP ${status}.`, 502)
  const results = Array.isArray(json?.results) ? json.results : []
  const scans = results.map(item => ({ date: item?.task?.time || '—', url: item?.page?.url || item?.task?.url || '—', ip: item?.page?.ip || '—', country: item?.page?.country || '—', server: item?.page?.server || '—', verdict: item?.verdicts?.overall?.malicious ? 'flagged' : 'not_flagged_by_urlscan', scan: item?._id ? `https://urlscan.io/result/${item._id}/` : '—' }))
  return { blocks: { summary: { domain, scans_found: json?.total ?? scans.length, returned: scans.length, source: 'urlscan.io public search', note: 'A missing flag is not proof that a site is safe.' }, scans } }
}

export const LOOKUPS = {
  'tiktok-public': tiktokPublic,
  'github-intel': githubIntel,
  'urlscan-intel': urlscanIntel,
  'synthetic-test': syntheticTest,
  'ip-lookup': ipLookup,
  'asn-lookup': asnLookup,
  'domain-recon': domainRecon,
  'subdomain-enum': subdomainEnum,
  'web-fingerprint': webFingerprint,
  'hash-toolkit': hashToolkit,
  'email-intel': emailIntel,
  'mail-posture': mailPosture,
  'iban-check': ibanCheck,
  'bin-lookup': binLookup,
  'crypto-wallet': walletTrace,
  'phone-lookup': phoneLookup,
  'breach-search': breachSearch,
  'username-sweep': usernameSweep,
  'port-sweep': portSweep,
  wayback,
  metadata,
}

export const NEEDS_KEY = {
  'wifi-lookup': 'a WiGLE API key',
  'crypto-wallet': 'free mempool.space Bitcoin address API',
  'bin-lookup': 'free CardBinCheck API (keyless, fair-use)',
  'breach-search': 'free XposedOrNot email breach API (keyless)',
  'phone-lookup': 'free USACallerLookup API for US numbers; local fallback elsewhere',
  'discord-lookup': 'free Discord API; requires your own bot token',
  'snapchat-lookup': 'free official Snapchat/Snap Kit access where eligible; credentials required',
  'tiktok-lookup': 'free official TikTok API tier; OAuth/Research approval required',
  'tiktok-public': 'public TikTok profile or video page metadata; no key required',
  'github-intel': 'GitHub public REST API; no key required for basic public lookup',
  'urlscan-intel': 'urlscan.io public search API; fair-use rate limits apply',
  'telegram-lookup': 'free Telegram Bot API; requires your own bot token',
  'username-sweep': 'free public APIs: GitHub, GitLab, Stack Exchange and Reddit',
  'paste-search': 'paste site API keys',
  'port-sweep': 'free Shodan InternetDB passive host API (no active probing)',
}
