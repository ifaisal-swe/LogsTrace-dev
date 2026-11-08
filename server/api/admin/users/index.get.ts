import { z } from 'zod'

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(getQuery(event))
  const u = schema.users
  const where = q ? or(ilike(u.email, `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`), ilike(u.name, `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`)) : undefined
  return useDb().select({
    id: u.id, name: u.name, email: u.email, platformRole: u.platformRole,
    emailVerifiedAt: u.emailVerifiedAt, lockedUntil: u.lockedUntil, disabledAt: u.disabledAt, totpEnabledAt: u.totpEnabledAt, createdAt: u.createdAt
  }).from(u).where(where).orderBy(desc(u.createdAt)).limit(200)
})
