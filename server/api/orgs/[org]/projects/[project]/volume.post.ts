import { z } from 'zod'

const MAX_KEYS = 20
const MAX_SPAN_DAYS: Record<string, number | null> = { minute: 2, hour: 120, day: null, week: null, month: null }

const bodySchema = rangeSchema.extend({
  bucket: z.enum(['minute', 'hour', 'day', 'week', 'month']).nullable().default(null),
  split: z.enum(['none', 'level', 'channel', 'table']).default('none'),
  channel: z.string().max(100).optional(),
  level: z.enum(LOG_LEVELS).optional()
})

// Message counts for dashboards: optionally per time bucket, split by level, channel or table
export default defineEventHandler(async (event) => {
  const { project, user, role } = await requireProjectAccess(event, 'logs:read')
  // A dashboard with many panels on a 10 s refresh stays well under this
  await enforceRateLimit(event, `volume:user:${user.id}`, 300, 60)
  const body = await readValidated(event, bodySchema)

  // Fine buckets over long ranges are expensive and unreadable anyway
  const maxSpan = body.bucket ? MAX_SPAN_DAYS[body.bucket] : null
  if (maxSpan) {
    const from = body.from ? new Date(body.from).getTime() : 0
    const to = body.to ? new Date(body.to).getTime() : Date.now()
    if (to - from > maxSpan * 86_400_000) {
      throw createError({ statusCode: 400, statusMessage: `Per-${body.bucket} counts cover at most ${maxSpan} days. Pick a shorter range or a larger bucket.` })
    }
  }

  // Keep the busiest keys so a high-cardinality split can't return thousands of series
  const { rows, keys, capped } = await volume(project.id, body, MAX_KEYS)

  // Readable names for template ids
  const names: Record<string, string> = {}
  if (body.split === 'table') {
    const ids = keys.filter(Boolean)
    if (ids.length) {
      const t = schema.logTemplates
      const list = await useDb().select({ id: t.id, name: t.name, pattern: t.pattern }).from(t)
        .where(and(eq(t.projectId, project.id), inArray(t.id, ids)))
      const sensitive = roleCan(role, 'logs:read_sensitive')
      for (const x of list) {
        const label = x.name || x.pattern.slice(0, 60)
        names[x.id] = sensitive ? label : maskText(label)
      }
    }
  }
  return { rows, names, capped }
})
