import { z } from 'zod'

const DATA_PATH = /^[\w-]{1,64}(\.[\w-]{1,64}){0,4}$/
const csv = (v: unknown) => (typeof v === 'string' ? v.split(',').map(x => x.trim()).filter(Boolean) : [])

export const logQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  channel: z.string().max(100).optional(),
  template: z.string().uuid().optional(),
  // One level or a comma list, in any of the accepted spellings
  level: z.string().max(100).optional().transform((v, ctx) => {
    const list = csv(v).map(normalizeLevel)
    if (list.some(l => !l)) {
      ctx.addIssue({ code: 'custom', message: 'Unknown level' })
      return z.NEVER
    }
    return list.length ? [...new Set(list as LogLevel[])] : undefined
  }),
  trace: z.string().trim().max(128).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().max(60).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  order: z.enum(['asc', 'desc']).default('desc'),
  includeTotal: z.union([z.literal('true'), z.literal('1'), z.literal('false'), z.literal('0')]).optional()
    .transform(v => v === 'true' || v === '1')
})
export type LogQuery = z.infer<typeof logQuerySchema>
export type DataFilter = { path: string, value: string }

// `data.user.id=42` / `metadata.user.id=42` query keys become exact-match filters on the JSON data
export function readDataFilters(query: Record<string, unknown>): DataFilter[] {
  const out: DataFilter[] = []
  for (const [key, raw] of Object.entries(query)) {
    const m = /^(?:data|metadata)\.(.+)$/.exec(key)
    if (!m) continue
    const value = Array.isArray(raw) ? raw[0] : raw
    if (!DATA_PATH.test(m[1]!) || typeof value !== 'string' || value.length > 200) {
      throw createError({ statusCode: 400, statusMessage: `Invalid data filter "${key}". Use data.field=value (letters, digits, _ and -, up to 5 levels).` })
    }
    out.push({ path: m[1]!, value })
    if (out.length > 5) throw createError({ statusCode: 400, statusMessage: 'Use at most 5 data filters.' })
  }
  return out
}

export function parseLogQuery(query: Record<string, unknown>) {
  const parsed = logQuerySchema.safeParse(query)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({ statusCode: 400, statusMessage: `Invalid filter${issue?.path.length ? ` ${issue.path.join('.')}` : ''}: ${issue?.message ?? 'check the query'}` })
  }
  return { ...parsed.data, data: readDataFilters(query) }
}
