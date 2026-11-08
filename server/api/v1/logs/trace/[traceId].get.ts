import { z } from 'zod'

// Every message of one trace, oldest first
export default defineEventHandler(async (event) => {
  const { keyId, projectId, readSensitive } = await requireApiKey(event, 'read')
  await enforceRateLimit(event, `read:key:${keyId}`, 120, 60)
  const parsed = z.string().trim().min(1).max(128).safeParse(getRouterParam(event, 'traceId'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid trace id' })

  const res = await queryLogs(projectId, readSensitive, { ...parseLogQuery({}), trace: parsed.data, order: 'asc', limit: 200 })
  return {
    status: 'ok',
    masked: !readSensitive,
    data: res.items.map(r => ({
      id: r.id, timestamp: r.ts.toISOString(), level: r.level, body: r.text, channel: r.channel,
      traceId: r.traceId, spanId: r.spanId, templateId: r.templateId, metadata: r.data
    })),
    truncated: res.hasMore
  }
})
