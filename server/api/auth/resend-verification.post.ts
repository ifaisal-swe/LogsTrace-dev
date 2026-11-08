export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  if (user.emailVerified) return { ok: true, alreadyVerified: true }
  await sendEmailOtp(event, user)
  return { ok: true }
})
