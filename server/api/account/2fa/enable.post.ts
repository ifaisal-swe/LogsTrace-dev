import { z } from 'zod'

// Step 2: the first code proves the app is set up; recovery codes are shown once
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await enforceRateLimit(event, `2fa-enable:user:${user.id}`, 10, 900)
  const { code } = await readValidated(event, z.object({ code: totpCodeSchema }))
  const db = useDb()
  const [row] = await db.select({ pending: schema.users.totpPendingSecret, enabled: schema.users.totpEnabledAt }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  if (row?.enabled) throw createError({ statusCode: 400, statusMessage: 'Two-step sign-in is already on.' })
  if (!row?.pending) throw createError({ statusCode: 400, statusMessage: 'Start the setup again.' })

  const step = matchTotp(decryptSecret(row.pending), code, null)
  if (step === null) throw createError({ statusCode: 400, statusMessage: 'That code doesn’t match. Check the time on your phone and try the next code.', data: { field: 'code' } })

  await db.update(schema.users).set({ totpSecret: row.pending, totpPendingSecret: null, totpEnabledAt: new Date(), totpLastStep: step, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))
  const codes = await replaceRecoveryCodes(user.id)
  // Sessions an attacker may already hold end now; this device stays signed in
  await destroyOtherSessions(user.id, event.context.sessionId)
  await audit(event, 'auth.two_factor_enabled', { userId: user.id })
  await sendSecurityEmail(event, user, (w, link) => securityChangeEmail(user.name, '2fa_enabled', w, link))
  return { recoveryCodes: codes }
})
