export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, `forgot:ip:${clientIp(event)}`, 10, 3600)
  const { email } = await readValidated(event, forgotSchema)
  await enforceRateLimit(event, `forgot:email:${email}`, 3, 3600)

  const [user] = await useDb().select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, disabledAt: schema.users.disabledAt })
    .from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1)

  // Same response whether or not the account exists, so emails can't be enumerated
  // The slow part (token + email) runs after the response, so timing doesn't reveal the account either
  if (user && !user.disabledAt) event.waitUntil((async () => {
    const token = await issueAuthToken(user.id, 'reset_password')
    // Same answer even if sending fails, so the response never reveals whether the account exists
    await sendMail(user.email, resetPasswordEmail(user.name, appLink(`/reset-password?token=${token}`)))
      .catch(err => console.error('[mail] reset email failed', err?.statusMessage ?? err))
    await audit(event, 'auth.password_reset_requested', { userId: user.id })
  })().catch(err => console.error('[forgot] failed', err)))
  return { ok: true }
})
