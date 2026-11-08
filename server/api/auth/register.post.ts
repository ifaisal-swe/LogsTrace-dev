import { z } from 'zod'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, `register:ip:${clientIp(event)}`, 5, 3600)
  const { name, email, password, invite } = await readValidated(event, registerSchema.extend({ invite: z.string().max(200).optional() }))
  const db = useDb()
  const config = useRuntimeConfig()

  // Registration mode: open, invite (a pending invitation for this exact email), or closed.
  // The bootstrap admin email can always register so a fresh install can be set up.
  const mode = config.public.registration
  const isBootstrap = !!config.bootstrapAdminEmail && email === String(config.bootstrapAdminEmail).toLowerCase()
  if (mode !== 'open' && !isBootstrap) {
    const invitation = mode === 'invite' && invite ? await findOpenInvite(invite) : null
    if (!invitation || invitation.email.toLowerCase() !== email) {
      throw createError({ statusCode: 403, statusMessage: mode === 'closed' ? 'New accounts are not being accepted.' : 'You need an invitation to create an account. Use the link from your invitation email.' })
    }
  }

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`).limit(1)
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists. Sign in instead.', data: { field: 'email' } })
  }

  // The configured bootstrap email becomes platform admin, but only while no admin exists
  let platformRole: 'user' | 'admin' = 'user'
  if (isBootstrap) {
    const [admin] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.platformRole, 'admin')).limit(1)
    if (!admin) platformRole = 'admin'
  }

  const [user] = await db.insert(schema.users).values({
    name, email, passwordHash: await hashPassword(password), platformRole
  }).returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name })

  await audit(event, 'auth.register', { userId: user!.id, meta: { platformRole } })
  // Unverified sessions only reach account and verification endpoints (requireVerifiedUser)
  await createSession(event, user!.id)
  // A failed send shouldn't lose the new account; the verify page offers "send a new code"
  await sendEmailOtp(event, user!).catch(err => console.error('[otp] initial send failed', err?.statusMessage ?? err))
  return { ok: true, needsVerification: !!config.requireEmailVerification }
})
