import { z } from 'zod'

const position = z.number().int().min(0).max(199)
export const tableQuerySchema = rangeSchema.extend({
  filters: z.array(filterSchema).max(20).default([]),
  mode: z.enum(['rows', 'summary']).default('rows'),
  groupBy: z.array(position).max(3).default([]),
  bucket: z.enum(['minute', 'hour', 'day', 'week', 'month']).nullable().default(null),
  metrics: z.array(z.object({ fn: z.enum(AGG_FNS), field: position.optional() })).max(6).default([{ fn: 'count' }]),
  // ts | a column position | m<index> (summary metric) | g<index> (summary group)
  sort: z.object({ by: z.union([z.literal('ts'), position, z.string().regex(/^[mg]\d$/)]), dir: z.enum(['asc', 'desc']) }).default({ by: 'ts', dir: 'desc' }),
  page: z.number().int().min(0).max(1000).default(0),
  limit: z.number().int().min(1).max(500).default(100),
  format: z.enum(['json', 'csv']).default('json')
})
export type TableQueryBody = z.infer<typeof tableQuerySchema>
type Template = typeof schema.logTemplates.$inferSelect

export const METRIC_LABEL: Record<typeof AGG_FNS[number], string> = {
  count: 'Count', sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max', count_distinct: 'Distinct'
}

export function checkTableQuery(template: Template, body: TableQueryBody) {
  for (const f of body.filters) requireColumn(template, f.field)
  for (const g of body.groupBy) requireColumn(template, g)
  if (typeof body.sort.by === 'number') requireColumn(template, body.sort.by)
  for (const m of body.metrics) {
    if (m.fn !== 'count') {
      if (m.field === undefined) throw createError({ statusCode: 400, statusMessage: `${METRIC_LABEL[m.fn]} needs a column.` })
      requireColumn(template, m.field)
    }
  }
}
