export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const id = getUuidParam(event, 'id')
  await destroyOtherSessions(id)
  await audit(event, 'admin.user_sessions_revoked', { meta: { targetId: id } })
  return { ok: true }
})
