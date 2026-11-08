import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const admin = requirePlatformAdmin(event)
  const id = getUuidParam(event, 'id')
  const body = await readValidated(event, z.object({
    platformRole: z.enum(['user', 'moderator', 'admin']).optional(),
    disabled: z.boolean().optional(),
    unlock: z.literal(true).optional(),
    verifyEmail: z.literal(true).optional(),
    // For people who lost their phone and recovery codes; they sign in with the password only afterwards
    resetTwoFactor: z.literal(true).optional()
  }))
  if (id === admin.id && ((body.platformRole && body.platformRole !== 'admin') || body.disabled)) {
    throw createError({ statusCode: 400, statusMessage: 'You can\'t demote or disable your own account.' })
  }

  const set: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() }
  if (body.platformRole) set.platformRole = body.platformRole
  if (body.disabled !== undefined) set.disabledAt = body.disabled ? new Date() : null
  if (body.unlock) { set.lockedUntil = null; set.failedLogins = 0 }
  if (body.verifyEmail) set.emailVerifiedAt = new Date()
  if (body.resetTwoFactor) Object.assign(set, { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null })

  const [row] = await useDb().update(schema.users).set(set).where(eq(schema.users.id, id)).returning({ id: schema.users.id })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  // A disabled account is signed out everywhere immediately
  if (body.disabled) await destroyOtherSessions(id)
  if (body.resetTwoFactor) await useDb().delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, id))
  await audit(event, 'admin.user_updated', { meta: { targetId: id, ...body } })
  return { ok: true }
})
