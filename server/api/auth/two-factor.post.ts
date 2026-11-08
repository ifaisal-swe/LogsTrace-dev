// Second sign-in step: authenticator code or a recovery code, after the password was accepted
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, `2fa:ip:${clientIp(event)}`, 30, 900)
  const { challenge, method, code } = await readValidated(event, twoFactorLoginSchema)
  const db = useDb()
  const t = schema.authTokens
  const [pending] = await db.select({ userId: t.userId }).from(t)
    .where(and(eq(t.tokenHash, sha256(challenge)), eq(t.type, 'login_2fa'), isNull(t.usedAt), gt(t.expiresAt, new Date()))).limit(1)
  if (!pending) throw createError({ statusCode: 400, statusMessage: 'This sign-in took too long. Enter your password again.' })

  // 6 digits: 5 tries per 15 minutes and 20 per day per account keep guessing impractical
  await enforceRateLimit(event, `2fa:user:${pending.userId}`, 5, 900)
  await enforceRateLimit(event, `2fa:user-day:${pending.userId}`, 20, 86400)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, pending.userId)).limit(1)
  if (!user || user.disabledAt || !user.totpEnabledAt) throw createError({ statusCode: 400, statusMessage: 'Enter your password again.' })

  // Recovery codes are scarce: claim the challenge first so a parallel request can't burn a second code
  if (method === 'recovery' && !(await consumeAuthToken(challenge, 'login_2fa'))) throw createError({ statusCode: 400, statusMessage: 'Enter your password again.' })
  const ok = method === 'totp' ? await consumeTotpCode(user, code) : await consumeRecoveryCode(user.id, code)
  if (!ok) {
    await audit(event, 'auth.two_factor_failed', { userId: user.id, meta: { method } })
    await noticeFailedSecondStep(event, user)
    throw createError({ statusCode: 401, statusMessage: method === 'totp' ? 'That code is wrong or was already used. Wait for the next one.' : 'That recovery code is wrong or was already used. Enter your password again to retry.', data: { field: 'code' } })
  }
  // The challenge works once
  if (method === 'totp' && !(await consumeAuthToken(challenge, 'login_2fa'))) throw createError({ statusCode: 400, statusMessage: 'Enter your password again.' })

  const result = await finishSignIn(event, user, { twoFactor: method })
  if (method !== 'recovery') return result
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.recoveryCodes)
    .where(and(eq(schema.recoveryCodes.userId, user.id), isNull(schema.recoveryCodes.usedAt)))
  return { ...result, recoveryCodesLeft: left?.n ?? 0 }
})
