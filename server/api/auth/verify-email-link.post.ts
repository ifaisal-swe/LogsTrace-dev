import { z } from 'zod'

// No session needed: the link may be opened on another device. It verifies the address but never signs in.
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, `verify-link:ip:${clientIp(event)}`, 20, 3600)
  const { token } = await readValidated(event, z.object({ token: z.string().min(20).max(200) }))
  const userId = await consumeAuthToken(token, 'verify_email')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'This link has expired or was already used. Sign in and send a new code.' })
  await markEmailVerified(event, userId, 'link')
  return { ok: true }
})
