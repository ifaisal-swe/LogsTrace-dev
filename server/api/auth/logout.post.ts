export default defineEventHandler(async (event) => {
  const userId = event.context.user?.id
  await destroySession(event)
  if (userId) await audit(event, 'auth.logout', { userId })
  return { ok: true }
})
