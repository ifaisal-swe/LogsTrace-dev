// Platform-wide message count for the landing page. One cache entry for every URL, so query strings
// can't force a recount; rounded down here so the exact total never leaves the server.
export default defineCachedEventHandler(async () => {
  const n = await totalLogs()
  const unit = n >= 1 ? 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1) : 1
  return { logs: Math.floor(n / unit) * unit, at: new Date().toISOString() }
}, { name: 'public-stats', getKey: () => 'total', maxAge: 3600, swr: true })
