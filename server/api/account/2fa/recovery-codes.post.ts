// New set of recovery codes; the old ones stop working
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { password } = await readValidated(event, passwordConfirmSchema)
  await confirmPassword(event, user.id, password)
  const [row] = await useDb().select({ enabled: schema.users.totpEnabledAt }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  if (!row?.enabled) throw createError({ statusCode: 400, statusMessage: 'Turn on two-step sign-in first.' })
  const codes = await replaceRecoveryCodes(user.id)
  await destroyOtherSessions(user.id, event.context.sessionId)
  await audit(event, 'auth.recovery_codes_regenerated', { userId: user.id })
  await sendSecurityEmail(event, user, (w, link) => securityChangeEmail(user.name, 'recovery_regenerated', w, link))
  return { recoveryCodes: codes }
})
