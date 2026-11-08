import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

// Authenticator-app codes (RFC 6238: SHA-1, 6 digits, 30 s), secrets encrypted at rest, recovery codes

const STEP = 30
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const DEV_KEY = 'logstrace-dev-only-secret-key'

function base32Encode(buf: Buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(text: string) {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) continue
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function newTotpSecret() {
  return base32Encode(randomBytes(20))
}

function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const o = h[h.length - 1]! & 15
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!
  return String(n % 1_000_000).padStart(6, '0')
}

// Accepts the previous, current and next step for clock drift; returns the matched step or null
export function matchTotp(secret: string, code: string, lastStep: number | null) {
  if (!/^\d{6}$/.test(code)) return null
  const now = Math.floor(Date.now() / 1000 / STEP)
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue
    const a = Buffer.from(codeAt(secret, step))
    if (timingSafeEqual(a, Buffer.from(code))) return step
  }
  return null
}

export function totpUri(secret: string, email: string) {
  const issuer = 'LogsTrace'
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${STEP}`
}

function key() {
  const raw = String(useRuntimeConfig().secretKey || '')
  if (!raw) {
    if (!import.meta.dev) throw createError({ statusCode: 503, statusMessage: 'Two-step sign-in is not configured on this server (NUXT_SECRET_KEY).' })
    return createHash('sha256').update(DEV_KEY).digest()
  }
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}`
}

export function decryptSecret(stored: string) {
  const [v, iv, tag, data] = stored.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unknown secret format')
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8')
}

// "abcd-efgh-jkmn": 50 bits, no look-alike characters
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function newRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')).join('-'))
}
export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '')
export const hashRecoveryCode = (userId: string, code: string) => createHmac('sha256', key()).update(`recovery:${userId}:${normalizeRecoveryCode(code)}`).digest('hex')

export async function replaceRecoveryCodes(userId: string) {
  const codes = newRecoveryCodes()
  const db = useDb()
  await db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId))
  await db.insert(schema.recoveryCodes).values(codes.map(c => ({ userId, codeHash: hashRecoveryCode(userId, c) })))
  return codes
}

// Consumes atomically, so a recovery code works once even under parallel requests
export async function consumeRecoveryCode(userId: string, code: string) {
  const [row] = await useDb().update(schema.recoveryCodes).set({ usedAt: new Date() })
    .where(and(eq(schema.recoveryCodes.userId, userId), eq(schema.recoveryCodes.codeHash, hashRecoveryCode(userId, code)), isNull(schema.recoveryCodes.usedAt)))
    .returning({ id: schema.recoveryCodes.id })
  return !!row
}

// TOTP check that also advances the last-used step atomically (no replay, no race)
export async function consumeTotpCode(user: { id: string, totpSecret: string | null, totpLastStep: number | null }, code: string) {
  if (!user.totpSecret) return false
  const step = matchTotp(decryptSecret(user.totpSecret), code, user.totpLastStep)
  if (step === null) return false
  const [row] = await useDb().update(schema.users).set({ totpLastStep: step })
    .where(and(eq(schema.users.id, user.id), sql`coalesce(${schema.users.totpLastStep}, -1) < ${step}`))
    .returning({ id: schema.users.id })
  return !!row
}
