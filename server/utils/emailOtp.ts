import { randomInt } from 'node:crypto'
import type { H3Event } from 'h3'

// Email verification: one email carries a 6-digit code and a one-time link; both are stored only as hashes

const TTL_MINUTES = 10

type OtpUser = { id: string, email: string, name: string }

const codeHash = (userId: string, code: string) => sha256(`otp:${userId}:${code}`)

export async function sendEmailOtp(event: H3Event, user: OtpUser) {
  await enforceRateLimit(event, `otp:send:min:${user.id}`, 1, 60)
  await enforceRateLimit(event, `otp:send:hour:${user.id}`, 6, 3600)

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const linkToken = randomToken(32)
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000)
  const db = useDb()
  // Only the newest code and link work
  await db.update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, user.id), eq(schema.authTokens.type, 'verify_email'), isNull(schema.authTokens.usedAt)))
  await db.insert(schema.authTokens).values([
    { userId: user.id, type: 'verify_email', tokenHash: codeHash(user.id, code), expiresAt },
    { userId: user.id, type: 'verify_email', tokenHash: sha256(linkToken), expiresAt }
  ])
  const link = appLink(`/confirm-email?token=${encodeURIComponent(linkToken)}`)
  await sendMail(user.email, verifyCodeEmail(user.name, code, link, TTL_MINUTES))
}

export async function verifyEmailOtp(event: H3Event, user: { id: string }, code: string) {
  // 6-digit codes: 5 tries per 15 minutes makes guessing impractical
  await enforceRateLimit(event, `otp:verify:${user.id}`, 5, 900)
  const [row] = await useDb().update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(
      eq(schema.authTokens.tokenHash, codeHash(user.id, code)),
      eq(schema.authTokens.type, 'verify_email'),
      isNull(schema.authTokens.usedAt),
      gt(schema.authTokens.expiresAt, new Date())
    ))
    .returning({ id: schema.authTokens.id })
  return !!row
}

// Also burns the unused half of the pair (code or link)
export async function markEmailVerified(event: H3Event, userId: string, method: 'code' | 'link') {
  const db = useDb()
  await db.update(schema.users).set({ emailVerifiedAt: sql`coalesce(${schema.users.emailVerifiedAt}, now())`, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
  await db.update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, userId), eq(schema.authTokens.type, 'verify_email'), isNull(schema.authTokens.usedAt)))
  await audit(event, 'auth.email_verified', { userId, meta: { method } })
}
