export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, `reset:ip:${clientIp(event)}`, 10, 3600)
  const { token, password } = await readValidated(event, resetSchema)
  const userId = await consumeAuthToken(token, 'reset_password')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'This reset link has expired or was already used. Request a new one.' })

  const db = useDb()
  await db.update(schema.users).set({
    passwordHash: await hashPassword(password),
    failedLogins: 0,
    lockedUntil: null,
    // Following an emailed link proves the address
    emailVerifiedAt: sql`coalesce(${schema.users.emailVerifiedAt}, now())`,
    updatedAt: new Date()
  }).where(eq(schema.users.id, userId))

  // A reset signs out every device
  await destroyOtherSessions(userId)
  await audit(event, 'auth.password_reset', { userId })
  const [user] = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (user) await sendSecurityEmail(event, user, (w, link) => securityChangeEmail(user.name, 'password_reset', w, link))
  return { ok: true }
})
