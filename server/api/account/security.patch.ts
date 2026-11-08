export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { loginAlerts, password } = await readValidated(event, securitySettingsSchema)
  // Turning warnings off is what an intruder would do first
  if (!loginAlerts) await confirmPassword(event, user.id, password ?? '')
  await useDb().update(schema.users).set({ loginAlerts, updatedAt: new Date() }).where(eq(schema.users.id, user.id))
  await audit(event, 'auth.security_settings', { userId: user.id, meta: { loginAlerts } })
  return { ok: true }
})
