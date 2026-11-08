export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/api/ingest') || event.path.startsWith('/api/v1/') || event.path.startsWith('/socket.io/') || event.path.startsWith('/_nuxt/') || event.path.startsWith('/__nuxt')) return
  const session = await loadSession(event)
  if (session) {
    event.context.user = session.user
    event.context.sessionId = session.sessionId
  }
})
