import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  if (user.emailVerified) return { ok: true }
  const { code } = await readValidated(event, z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the code from the email.') }))
  if (!(await verifyEmailOtp(event, user, code))) {
    await audit(event, 'auth.email_verify_failed', { userId: user.id })
    throw createError({ statusCode: 400, statusMessage: 'That code is wrong or has expired. Check the email or send a new code.', data: { field: 'code' } })
  }
  await markEmailVerified(event, user.id, 'code')
  return { ok: true }
})
