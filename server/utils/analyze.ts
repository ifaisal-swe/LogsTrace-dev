import { z } from 'zod'

// Column values are computed in ClickHouse at query time (logStore.ts), with the same tokenising as drain.ts,
// so filters stay correct when a template gains columns and no stored copy can drift.

export const FILTER_OPS = ['eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'empty', 'not_empty'] as const
export const AGG_FNS = ['count', 'sum', 'avg', 'min', 'max', 'count_distinct'] as const

const position = z.number().int().min(0).max(199)
export const filterSchema = z.object({
  field: position,
  op: z.enum(FILTER_OPS),
  value: z.string().max(500).default(''),
  value2: z.string().max(500).optional()
})
export const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional()
})

export async function loadTemplate(projectId: string, id: string) {
  const [template] = await useDb().select().from(schema.logTemplates)
    .where(and(eq(schema.logTemplates.id, id), eq(schema.logTemplates.projectId, projectId))).limit(1)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'Table not found' })
  return template
}

export function requireColumn(template: { tokens: string[] }, pos: number) {
  if (template.tokens[pos] !== WILDCARD) throw createError({ statusCode: 400, statusMessage: 'That column is not part of this table.' })
}
