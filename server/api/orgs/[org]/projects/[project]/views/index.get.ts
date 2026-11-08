import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event, 'logs:read')
  const parsed = z.object({ kind: z.enum(['table', 'logs']).optional(), template: z.string().uuid().optional() }).safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid filter' })
  const q = parsed.data
  const v = schema.savedViews
  const where = [eq(v.projectId, project.id)]
  if (q.kind) where.push(eq(v.kind, q.kind))
  if (q.template) where.push(eq(v.templateId, q.template))
  return useDb().select({
    id: v.id, kind: v.kind, templateId: v.templateId, name: v.name, query: v.query, createdAt: v.createdAt,
    createdBy: schema.users.name
  }).from(v).leftJoin(schema.users, eq(schema.users.id, v.createdBy))
    .where(and(...where)).orderBy(asc(v.name)).limit(200)
})
