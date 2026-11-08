import type { IncomingMessage } from 'node:http'

// MCP over Streamable HTTP (stateless). Auth = read API key; the key decides project and masking.
export default defineEventHandler(async (event) => {
  if (!useRuntimeConfig().mcpEnabled) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (event.method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST')
    throw createError({ statusCode: 405, statusMessage: 'Use POST' })
  }
  const { keyId, projectId, readSensitive } = await requireApiKey(event, 'read')
  await enforceRateLimit(event, `mcp:key:${keyId}`, 60, 60)

  const req = event.node.req as IncomingMessage & { auth?: unknown }
  // The raw key is not passed on; tools only get what they need
  req.auth = { token: keyId, clientId: keyId, scopes: ['read'], extra: { keyId, projectId, sensitive: readSensitive } satisfies McpCaller }

  const appUrl = new URL(useRuntimeConfig().appUrl)
  const server = await mcpServer()
  await server.startHTTP({
    url: new URL(event.path, appUrl),
    httpPath: '/api/mcp',
    req,
    res: event.node.res,
    // Browsers on other sites (or DNS-rebinding pages) can't call it; non-browser clients send no Origin
    options: { enableDnsRebindingProtection: true, allowedOrigins: [appUrl.origin] }
  })
})
