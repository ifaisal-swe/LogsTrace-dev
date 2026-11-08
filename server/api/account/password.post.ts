export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await enforceRateLimit(event, `pwchange:user:${user.id}`, 5, 900)
  const { currentPassword, newPassword } = await readValidated(event, changePasswordSchema)

  const db = useDb()
  const [row] = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id))
  if (!row || !(await verifyPassword(row.passwordHash, currentPassword))) {
    await audit(event, 'auth.password_change_failed')
    throw createError({ statusCode: 400, statusMessage: 'Current password is incorrect.', data: { field: 'currentPassword' } })
  }

  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() }).where(eq(schema.users.id, user.id))
  // Keep this device signed in, sign out the rest
  await destroyOtherSessions(user.id, event.context.sessionId)
  await audit(event, 'auth.password_changed')
  await sendSecurityEmail(event, user, (w, link) => securityChangeEmail(user.name, 'password_changed', w, link))
  return { ok: true }
})
