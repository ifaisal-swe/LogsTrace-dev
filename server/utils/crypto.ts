import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>

// N=2^15 is ~100ms per hash; maxmem raised because Node's default (32MB) is just below what N=2^15, r=8 needs
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEY_LEN = 64

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(stored: string, password: string) {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$')
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Hash of a random string, used to equalise timing when the email doesn't exist
let dummyHash: Promise<string> | undefined
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  return dummyHash
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

// Tokens are stored only as SHA-256; they're high-entropy, so a fast hash is enough
export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
