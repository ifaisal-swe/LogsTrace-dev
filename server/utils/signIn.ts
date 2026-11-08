import type { H3Event } from 'h3'

type SignInUser = { id: string, email: string, name: string, emailVerifiedAt: Date | null, loginAlerts: boolean }

// Last step of every sign-in (password only, or password + second step)
export async function finishSignIn(event: H3Event, user: SignInUser, meta: Record<string, unknown> = {}) {
  const ua = userAgent(event)
  // "New device" = no session of this user with the same browser string on record
  const [known] = await useDb().select({ id: schema.sessions.id }).from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), ua ? eq(schema.sessions.userAgent, ua) : sql`false`)).limit(1)
  await createSession(event, user.id)
  await audit(event, 'auth.login', { userId: user.id, meta })
  if (!known && user.loginAlerts) await sendSecurityEmail(event, user, (w, link) => newSignInEmail(user.name, w, link))
  return { ok: true, needsVerification: !!useRuntimeConfig().requireEmailVerification && !user.emailVerifiedAt }
}

// Several wrong second-step codes mean someone may know the password: cancel open challenges and tell the owner (once a day)
export async function noticeFailedSecondStep(event: H3Event, user: { id: string, email: string, name: string }) {
  const { allowed } = await hitRateLimit(`2fa-fail:${user.id}`, 3, 3600)
  if (allowed) return
  await useDb().update(schema.authTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.userId, user.id), eq(schema.authTokens.type, 'login_2fa'), isNull(schema.authTokens.usedAt)))
  const once = await hitRateLimit(`2fa-fail-mail:${user.id}`, 1, 86400)
  if (once.allowed) await sendSecurityEmail(event, user, (w, link) => securityChangeEmail(user.name, '2fa_failed', w, link))
}

// Account settings that change security need the password again
export async function confirmPassword(event: H3Event, userId: string, password: string) {
  await enforceRateLimit(event, `pwconfirm:user:${userId}`, 10, 900)
  const [row] = await useDb().select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!row || !(await verifyPassword(row.passwordHash, password))) {
    await audit(event, 'auth.password_confirm_failed', { userId })
    throw createError({ statusCode: 400, statusMessage: 'Password is incorrect.', data: { field: 'password' } })
  }
}
