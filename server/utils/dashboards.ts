import { z } from 'zod'

export const MAX_PANELS = 24
export const MAX_DASHBOARDS = 50

const position = z.number().int().min(0).max(199)
const level = z.enum(LOG_LEVELS)
const title = z.string().trim().max(80)
  .refine(isSafeDisplayText, 'Titles can\'t contain links, email addresses or hidden characters')

const tableSource = z.object({
  kind: z.literal('table'),
  templateId: z.string().uuid(),
  filters: z.array(filterSchema).max(10).default([]),
  metric: z.object({ fn: z.enum(AGG_FNS), field: position.optional() }),
  groupBy: position.nullable().default(null)
})
const volumeSource = z.object({
  kind: z.literal('volume'),
  split: z.enum(['none', 'level', 'channel', 'table']),
  channel: z.string().max(100).optional(),
  level: level.optional()
})
const logsSource = z.object({
  kind: z.literal('logs'),
  q: z.string().trim().max(200).optional(),
  channel: z.string().max(100).optional(),
  level: level.optional(),
  template: z.string().uuid().optional()
})

export const panelSchema = z.object({
  id: z.string().uuid(),
  title,
  type: z.enum(['timeseries', 'bars', 'stat', 'table', 'logs']),
  w: z.union([z.literal(3), z.literal(4), z.literal(6), z.literal(8), z.literal(12)]),
  h: z.enum(['s', 'm', 'l']),
  source: z.discriminatedUnion('kind', [tableSource, volumeSource, logsSource])
}).superRefine((p, ctx) => {
  const kind = p.source.kind
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['source'] })
  if (p.type === 'logs' && kind !== 'logs') bad('A logs panel shows messages, not tables or volume.')
  if (p.type !== 'logs' && kind === 'logs') bad('Messages can only be shown in a logs panel.')
  if (p.type === 'table' && kind !== 'table') bad('A table panel needs a table as its source.')
  if (p.type === 'bars') {
    if (kind === 'table' && p.source.groupBy === null) bad('A bar panel needs a column to group by.')
    if (kind === 'volume' && p.source.split === 'none') bad('A bar panel needs a split (level, channel or table).')
  }
  if (kind === 'table' && p.source.metric.fn !== 'count' && p.source.metric.field === undefined) {
    bad('This calculation needs a column.')
  }
})

const description = z.string().trim().max(300)
  .refine(isSafeDisplayText, 'Descriptions can\'t contain links, email addresses or hidden characters')

export const dashboardSchema = z.object({
  name: nameSchema,
  description: description.nullable().optional(),
  panels: z.array(panelSchema).max(MAX_PANELS).default([])
})
// No defaults here, so a rename can't wipe the panels
export const dashboardPatchSchema = z.object({
  name: nameSchema.optional(),
  description: description.nullable().optional(),
  panels: z.array(panelSchema).max(MAX_PANELS).optional()
})

// Panels may only point at tables of the same project
export async function requirePanelTemplates(projectId: string, panels: z.infer<typeof panelSchema>[]) {
  const ids = new Set<string>()
  for (const p of panels) {
    if (p.source.kind === 'table') ids.add(p.source.templateId)
    if (p.source.kind === 'logs' && p.source.template) ids.add(p.source.template)
  }
  if (!ids.size) return
  const rows = await useDb().select({ id: schema.logTemplates.id }).from(schema.logTemplates)
    .where(and(eq(schema.logTemplates.projectId, projectId), inArray(schema.logTemplates.id, [...ids])))
  if (rows.length !== ids.size) throw createError({ statusCode: 400, statusMessage: 'A panel points at a table that is not in this project.' })
}

export async function loadDashboard(projectId: string, id: string) {
  const [row] = await useDb().select().from(schema.dashboards)
    .where(and(eq(schema.dashboards.id, id), eq(schema.dashboards.projectId, projectId))).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  return row
}
