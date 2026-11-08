const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const MAX_JSON_BYTES = 256 * 1024

// Cookie-authenticated API writes must come from this site. /api/ingest uses API keys, not cookies.
export default defineEventHandler((event) => {
  const path = event.path
  if (!path.startsWith('/api/') || SAFE_METHODS.has(event.method)) return

  // Bodies must declare their size up front so limits can't be dodged with chunked uploads
  const length = getRequestHeader(event, 'content-length')
  const hasBody = getRequestHeader(event, 'transfer-encoding') !== undefined || length !== undefined
  if (hasBody && length === undefined) throw createError({ statusCode: 411, statusMessage: 'Content-Length is required.' })
  if (path.startsWith('/api/ingest')) return
  if (Number(length ?? 0) > MAX_JSON_BYTES) throw createError({ statusCode: 413, statusMessage: 'Request body is too large.' })

  const origin = getRequestHeader(event, 'origin') ?? getRequestHeader(event, 'referer')
  // Signed webhooks from the mail provider carry no cookies and no browser Origin
  if (path.split('?')[0] === '/api/inbound/resend') return
  // MCP authenticates with an API key, never cookies; a browser Origin must still be ours
  if (path.split('?')[0] === '/api/mcp' && !origin) return
  if (!isAllowedOrigin(origin, getRequestHeader(event, 'host'))) {
    throw createError({ statusCode: 403, statusMessage: 'Request origin not allowed' })
  }
})
