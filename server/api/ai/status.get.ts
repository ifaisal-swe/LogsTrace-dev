export default defineEventHandler((event) => {
  requireVerifiedUser(event)
  return { enabled: aiEnabled(), mcp: !!useRuntimeConfig().mcpEnabled }
})
