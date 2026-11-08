import { z } from 'zod'

const fieldName = z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}_ -]+$/u, 'Use letters, numbers, spaces, - or _')
const tag = z.string().trim().toLowerCase().min(1).max(30).regex(/^[\p{L}\p{N}_-]+$/u, 'Tags use letters, numbers, - or _')
const description = z.string().trim().max(300)
  .refine(isSafeDisplayText, 'Descriptions can\'t contain links, email addresses or hidden characters')

export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'templates:manage')
  const id = getUuidParam(event, 'id')
  const body = await readValidated(event, z.object({
    name: z.union([nameSchema, z.literal('')]).nullable().optional(),
    description: description.nullable().optional(),
    tags: z.array(tag).max(10).optional(),
    pinned: z.boolean().optional(),
    hidden: z.boolean().optional(),
    fields: z.array(z.object({ position: z.number().int().min(0), name: fieldName, type: z.enum(['number', 'id', 'text']) })).max(200).optional()
  }))

  const db = useDb()
  const [template] = await db.select().from(schema.logTemplates)
    .where(and(eq(schema.logTemplates.id, id), eq(schema.logTemplates.projectId, project.id))).limit(1)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  const set: Partial<typeof schema.logTemplates.$inferInsert> = {}
  if (body.name !== undefined) set.name = body.name || null
  if (body.description !== undefined) set.description = body.description || null
  if (body.tags) set.tags = [...new Set(body.tags)]
  if (body.pinned !== undefined) set.pinned = body.pinned
  if (body.hidden !== undefined) set.hidden = body.hidden
  if (body.fields) {
    // Only rename fields that exist at their current positions
    const incoming = new Map(body.fields.map(f => [f.position, f]))
    set.fields = template.fields.map(f => ({ ...f, ...(incoming.get(f.position) ?? {}), position: f.position }))
  }
  if (!Object.keys(set).length) return { ok: true }

  await db.update(schema.logTemplates).set(set).where(eq(schema.logTemplates.id, id))
  if (set.fields) updateCachedFields(project.id, id, set.fields)
  await audit(event, 'template.updated', { orgId: org.id, meta: { templateId: id, changed: Object.keys(set), name: set.name } })
  return { ok: true }
})
