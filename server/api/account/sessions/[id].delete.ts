export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getUuidParam(event, 'id')
  const deleted = await useDb().delete(schema.sessions)
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, user.id)))
    .returning({ id: schema.sessions.id })
  if (!deleted.length) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  await audit(event, 'auth.session_revoked', { meta: { sessionId: id } })
  if (id === event.context.sessionId) deleteCookie(event, SESSION_COOKIE, { path: '/' })
  return { ok: true }
})
