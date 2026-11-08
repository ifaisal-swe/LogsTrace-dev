import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { project, role } = await requireProjectAccess(event, 'logs:read')
  const id = getUuidParam(event, 'id')
  const { cursor, limit } = z.object({
    cursor: z.string().max(60).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100)
  }).parse(getQuery(event))

  const db = useDb()
  const [template] = await db.select().from(schema.logTemplates)
    .where(and(eq(schema.logTemplates.id, id), eq(schema.logTemplates.projectId, project.id))).limit(1)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  const events = await templateMessages(project.id, template.id, cursor, limit + 1)

  const sensitive = roleCan(role, 'logs:read_sensitive')
  const page = events.slice(0, limit)
  const rows = page.map((ev) => {
    const text = sensitive ? ev.text : maskText(ev.text)
    const values = extractValues(template.tokens, text)
    return { id: ev.id, ts: ev.ts, values: template.fields.map(f => values[f.position] ?? '') }
  })
  return { template: sensitive ? template : maskTemplateText(template), rows, nextCursor: events.length > limit ? encodeCursor(page.at(-1)!) : null, masked: !sensitive }
})
