// Needs the password and a current code (or a recovery code), so a stolen session alone can't turn it off
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { password, code } = await readValidated(event, twoFactorDisableSchema)
  await confirmPassword(event, user.id, password)
  await enforceRateLimit(event, `2fa-disable:user:${user.id}`, 5, 900)

  const db = useDb()
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  if (!row?.totpEnabledAt) throw createError({ statusCode: 400, statusMessage: 'Two-step sign-in is already off.' })
  const ok = /^\d{6}$/.test(code) ? await consumeTotpCode(row, code) : await consumeRecoveryCode(user.id, code)
  if (!ok) throw createError({ statusCode: 400, statusMessage: 'That code is wrong or was already used.', data: { field: 'code' } })

  await db.update(schema.users).set({ totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))
  await db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, user.id))
  await audit(event, 'auth.two_factor_disabled', { userId: user.id })
  await sendSecurityEmail(event, user, (w, link) => securityChangeEmail(user.name, '2fa_disabled', w, link))
  return { ok: true }
})
