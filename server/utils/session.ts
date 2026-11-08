import type { H3Event } from 'h3'

// __Host- pins the cookie to this exact origin over HTTPS (no Domain, Path=/), so subdomains can't plant one
export const SESSION_COOKIE = import.meta.dev ? 'lt_session' : '__Host-lt_session'
const SESSION_DAYS = 30
// Refresh last_seen/expiry at most this often to avoid a DB write per request
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

export type SessionUser = {
  id: string
  email: string
  name: string
  platformRole: 'user' | 'moderator' | 'admin'
  emailVerified: boolean
  // Email is in NUXT_OWNER_EMAILS and verified; opens the owner dashboard
  platformOwner: boolean
}

function isOwnerEmail(email: string) {
  const list = String(useRuntimeConfig().ownerEmails || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

export async function createSession(event: H3Event, userId: string) {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000)
  await useDb().insert(schema.sessions).values({
    userId,
    tokenHash: sha256(token),
    ip: clientIp(event),
    userAgent: userAgent(event),
    expiresAt
  })
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  })
}

async function findSessionRow(token: string) {
  const [row] = await useDb().select({
    sessionId: schema.sessions.id,
    lastSeenAt: schema.sessions.lastSeenAt,
    expiresAt: schema.sessions.expiresAt,
    user: {
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      platformRole: schema.users.platformRole,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      disabledAt: schema.users.disabledAt
    }
  })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, sha256(token)))
    .limit(1)
  return row
}

function toSessionUser(row: NonNullable<Awaited<ReturnType<typeof findSessionRow>>>): SessionUser {
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    platformRole: row.user.platformRole,
    emailVerified: !!row.user.emailVerifiedAt,
    platformOwner: !!row.user.emailVerifiedAt && isOwnerEmail(row.user.email)
  }
}

export async function loadSession(event: H3Event) {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token || token.length > 100) return null
  const db = useDb()
  const row = await findSessionRow(token)

  if (!row || row.expiresAt < new Date() || row.user.disabledAt) {
    if (row) await db.delete(schema.sessions).where(eq(schema.sessions.id, row.sessionId))
    deleteCookie(event, SESSION_COOKIE, { path: '/' })
    return null
  }

  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000)
    await db.update(schema.sessions)
      .set({ lastSeenAt: new Date(), expiresAt, ip: clientIp(event) })
      .where(eq(schema.sessions.id, row.sessionId))
  }

  return { sessionId: row.sessionId, user: toSessionUser(row) }
}

// Read-only lookup for connections that aren't h3 requests (live socket)
export async function findSession(token: string | undefined) {
  if (!token || token.length > 100) return null
  const row = await findSessionRow(token)
  if (!row || row.expiresAt < new Date() || row.user.disabledAt) return null
  return { sessionId: row.sessionId, user: toSessionUser(row) }
}

export async function destroySession(event: H3Event) {
  const sessionId = event.context.sessionId
  if (sessionId) await useDb().delete(schema.sessions).where(eq(schema.sessions.id, sessionId))
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export async function destroyOtherSessions(userId: string, keepSessionId?: string) {
  const db = useDb()
  const where = keepSessionId
    ? and(eq(schema.sessions.userId, userId), sql`${schema.sessions.id} <> ${keepSessionId}`)
    : eq(schema.sessions.userId, userId)
  await db.delete(schema.sessions).where(where)
}

export function requireUser(event: H3Event): SessionUser {
  const user = event.context.user as SessionUser | undefined
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  return user
}

export function requireVerifiedUser(event: H3Event) {
  const user = requireUser(event)
  if (useRuntimeConfig().requireEmailVerification && !user.emailVerified) {
    throw createError({ statusCode: 403, statusMessage: 'Verify your email address to continue.' })
  }
  return user
}

export function requirePlatformAdmin(event: H3Event) {
  const user = requireUser(event)
  if (user.platformRole !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Only platform admins can do this.' })
  // The bootstrap email gets admin at sign-up; without this, whoever registers it first holds admin unverified
  if (!user.emailVerified) throw createError({ statusCode: 403, statusMessage: 'Verify your email address to continue.' })
  return user
}

// 404 so the owner dashboard's existence doesn't leak
export function requirePlatformOwner(event: H3Event) {
  const user = requireUser(event)
  if (!user.platformOwner) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  return user
}

// Platform admins and moderators answer support tickets
export function requireSupportStaff(event: H3Event) {
  const user = requireUser(event)
  if (!isSupportStaff(user.platformRole)) throw createError({ statusCode: 403, statusMessage: 'Only the support team can do this.' })
  return user
}

declare module 'h3' {
  interface H3EventContext {
    user?: SessionUser
    sessionId?: string
  }
}
