// Step 1 of turning on two-step sign-in: a new secret, kept pending until the first code is confirmed
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { password } = await readValidated(event, passwordConfirmSchema)
  await confirmPassword(event, user.id, password)
  const [row] = await useDb().select({ totpEnabledAt: schema.users.totpEnabledAt }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  if (row?.totpEnabledAt) throw createError({ statusCode: 400, statusMessage: 'Two-step sign-in is already on.' })

  const secret = newTotpSecret()
  await useDb().update(schema.users).set({ totpPendingSecret: encryptSecret(secret) }).where(eq(schema.users.id, user.id))
  return { secret, uri: totpUri(secret, user.email) }
})
