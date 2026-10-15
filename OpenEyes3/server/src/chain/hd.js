import { HDKey } from '@scure/bip32'
import { base58check, bech32 } from '@scure/base'
import { ripemd160 } from '@noble/hashes/legacy'
import { sha256 } from '@noble/hashes/sha2'

const decodeBase58Check = base58check(sha256)

const PUBLIC_VERSIONS = new Map([
  [0x0488b21e, 0x0488ade4],
  [0x049d7cb2, 0x049d7878],
  [0x04b24746, 0x04b2430c],
  [0x019da462, 0x019d9cfe],
  [0x01b26ef6, 0x01b26792],
])

const PRIVATE_VERSIONS = new Set([0x0488ade4, 0x049d7878, 0x04b2430c, 0x019d9cfe, 0x01b26792])

function readVersion(extendedKey) {
  let raw
  try {
    raw = decodeBase58Check.decode(extendedKey)
  } catch {
    throw new Error('extended key is not valid base58check')
  }
  if (raw.length !== 78) throw new Error('extended key has the wrong length')
  return new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0, false)
}

export function parseAccountKey(extendedKey) {
  const version = readVersion(extendedKey)
  if (PRIVATE_VERSIONS.has(version)) {
    throw new Error('this is an extended private key, the server only accepts a public one')
  }
  const privateVersion = PUBLIC_VERSIONS.get(version)
  if (privateVersion === undefined) throw new Error('unknown extended key version')

  const node = HDKey.fromExtendedKey(extendedKey, { public: version, private: privateVersion })
  if (node.privateKey) throw new Error('extended key carries a private key')
  return node
}

export function deriveAddress(accountNode, hrp, index) {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error('derivation index out of range')
  }
  const child = accountNode.deriveChild(0).deriveChild(index)
  if (!child.publicKey) throw new Error('derivation produced no public key')
  const program = ripemd160(sha256(child.publicKey))
  return bech32.encode(hrp, [0, ...bech32.toWords(program)])
}

export function paymentUri(asset, address, amountUnits) {
  const scheme = asset === 'ltc' ? 'litecoin' : 'bitcoin'
  const amount = (amountUnits / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
  return `${scheme}:${address}?amount=${amount}`
}
