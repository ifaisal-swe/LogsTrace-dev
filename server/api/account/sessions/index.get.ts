export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const rows = await useDb().select({
    id: schema.sessions.id,
    ip: schema.sessions.ip,
    userAgent: schema.sessions.userAgent,
    createdAt: schema.sessions.createdAt,
    lastSeenAt: schema.sessions.lastSeenAt
  }).from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.lastSeenAt))
  return rows.map(s => ({ ...s, current: s.id === event.context.sessionId }))
})
