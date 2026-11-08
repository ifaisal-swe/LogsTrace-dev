import { z } from 'zod'

const RANGES = {
  '24h': { bucket: 'hour', span: '24 hours' },
  '7d': { bucket: 'hour', span: '7 days' },
  '30d': { bucket: 'day', span: '30 days' }
} as const

// Message counts per time bucket and level, for the overview chart
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event, 'logs:read')
  const parsed = z.object({ range: z.enum(['24h', '7d', '30d']).default('24h') }).safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid range' })
  const { bucket, span } = RANGES[parsed.data.range]
  return { bucket, rows: await activity(project.id, bucket, span) }
})
