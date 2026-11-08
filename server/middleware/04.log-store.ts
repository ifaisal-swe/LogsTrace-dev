// Marks responses whose log data is read from or written to ClickHouse (visible in the browser's Network tab)
const LOG_ROUTES = [
  /^\/api\/ingest$/,
  /^\/api\/v1\/logs(\/|$)/,
  /^\/api\/mcp$/,
  /^\/api\/me\/projects$/,
  /^\/api\/public\/stats$/,
  /^\/api\/orgs\/[^/]+\/projects\/[^/]+(\/(logs|search|volume|activity|templates|ai)(\/|$)|$)/
]

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!
  if (LOG_ROUTES.some(r => r.test(path))) setResponseHeader(event, 'x-log-store', 'clickhouse')
})
