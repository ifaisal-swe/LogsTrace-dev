export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await destroyOtherSessions(user.id, event.context.sessionId)
  await audit(event, 'auth.sessions_revoked_others')
  return { ok: true }
})
