// Query logs with a read API key. Accepts both LogsTrace and common names (body/resource/metadata.*).
export default defineEventHandler(async (event) => {
  const { keyId, projectId, readSensitive } = await requireApiKey(event, 'read')
  await enforceRateLimit(event, `read:key:${keyId}`, 120, 60)

  const raw = getQuery(event) as Record<string, unknown>
  const query = { ...raw, q: raw.q ?? raw.body, channel: raw.channel ?? raw.resource }
  const f = parseLogQuery(query)
  if (f.limit > 100) f.limit = 100
  const res = await queryLogs(projectId, readSensitive, f)

  return {
    status: 'ok',
    masked: !readSensitive,
    data: res.items.map(r => ({
      id: r.id,
      timestamp: r.ts.toISOString(),
      level: r.level,
      body: r.text,
      channel: r.channel,
      traceId: r.traceId,
      spanId: r.spanId,
      templateId: r.templateId,
      metadata: r.data
    })),
    pagination: { limit: f.limit, offset: f.offset ?? 0, hasMore: res.hasMore, nextCursor: res.nextCursor, ...(res.total !== undefined ? { total: res.total } : {}) }
  }
})
