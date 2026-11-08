import { count } from 'drizzle-orm'
import { z } from 'zod'

const MAX_VIEWS = 200
const position = z.number().int().min(0).max(199)

const tableQuery = z.object({
  range: z.enum(['all', '15m', '1h', '10h', '24h', '7d', '30d']),
  filters: z.array(filterSchema).max(20),
  mode: z.enum(['rows', 'summary']),
  groupBy: z.array(position).max(3),
  bucket: z.enum(['minute', 'hour', 'day', 'week', 'month']).nullable(),
  metrics: z.array(z.object({ fn: z.enum(AGG_FNS), field: position.optional() })).min(1).max(6),
  sort: z.object({ by: z.union([z.literal('ts'), position, z.string().regex(/^[mg]\d$/)]), dir: z.enum(['asc', 'desc']) })
})
const logsQuery = z.object({
  q: z.string().trim().max(200).optional(),
  channel: z.string().max(100).optional(),
  level: z.enum(LOG_LEVELS).optional(),
  trace: z.string().trim().max(128).optional(),
  data: z.string().trim().max(300).optional(),
  template: z.string().uuid().optional()
})

const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('table'), templateId: z.string().uuid(), name: nameSchema, query: tableQuery }),
  z.object({ kind: z.literal('logs'), name: nameSchema, query: logsQuery })
])

export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'templates:manage')
  const body = await readValidated(event, bodySchema)
  const db = useDb()

  const templateId = body.kind === 'table' ? body.templateId : body.query.template
  if (templateId) await loadTemplate(project.id, templateId)

  const [row] = await db.select({ n: count() }).from(schema.savedViews).where(eq(schema.savedViews.projectId, project.id))
  if ((row?.n ?? 0) >= MAX_VIEWS) throw createError({ statusCode: 400, statusMessage: `A project can keep up to ${MAX_VIEWS} saved views.` })

  const [view] = await db.insert(schema.savedViews).values({
    projectId: project.id,
    templateId: body.kind === 'table' ? body.templateId : null,
    kind: body.kind,
    name: body.name,
    query: body.query,
    createdBy: user.id
  }).returning()
  await audit(event, 'view.created', { orgId: org.id, meta: { viewId: view!.id, kind: body.kind, name: body.name } })
  return view
})
