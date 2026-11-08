const MAX_FAILED = 5
const LOCK_MINUTES = 15
const GENERIC = 'Email or password is incorrect.'

export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  await enforceRateLimit(event, `login:ip:${ip}`, 30, 900)
  const { email, password } = await readValidated(event, loginSchema)
  await enforceRateLimit(event, `login:email:${email}`, 10, 900)

  const db = useDb()
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1)

  if (!user) {
    await verifyPassword(await getDummyHash(), password)
    await audit(event, 'auth.login_failed', { meta: { email, reason: 'unknown_email' } })
    throw createError({ statusCode: 401, statusMessage: GENERIC })
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
    throw createError({ statusCode: 423, statusMessage: `Too many failed sign-ins. This account is locked for ${minutes} more minute(s).` })
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLogins + 1
    const lock = failed >= MAX_FAILED
    await db.update(schema.users).set({
      failedLogins: lock ? 0 : failed,
      lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil
    }).where(eq(schema.users.id, user.id))
    await audit(event, lock ? 'auth.account_locked' : 'auth.login_failed', { userId: user.id })
    throw createError({ statusCode: 401, statusMessage: GENERIC })
  }

  if (user.disabledAt) throw createError({ statusCode: 403, statusMessage: 'This account is disabled. Contact a platform admin.' })

  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, user.id))
  // Two-step sign-in: no session yet, only a short-lived challenge for the second step
  if (user.totpEnabledAt) {
    const challenge = await issueAuthToken(user.id, 'login_2fa')
    await audit(event, 'auth.login_second_step', { userId: user.id })
    return { ok: true, needsTwoFactor: true as const, challenge }
  }
  return finishSignIn(event, user)
})
