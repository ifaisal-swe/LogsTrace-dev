import { z } from 'zod'

// A plan is a small, fixed query language: the AI writes it, this file runs it.
// Only these four read operations exist, every step runs with the caller's role (masking included),
// inside a read-only transaction with a statement timeout. The model never sees the results.

export const PLAN_RANGES = ['15m', '1h', '6h', '24h', '7d', '30d', '90d', 'all'] as const
const RANGE_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 }
const MAX_STEPS = 6
const CHAIN_VALUES = 100
// Budget for the whole run, not per statement, so one plan can't hold a pool connection for minutes
const RUN_BUDGET_MS = 15_000
// Plan runs allowed at once across all users, keys and instances; the pool has 10 connections
const RUN_SLOTS = 4
const SLOT_LOCK = 4242

const position = z.number().int().min(0).max(199)
const stepId = z.string().regex(/^s[1-6]$/)
// Output columns of a step: time/level/channel/text/table, c<column position>, g<group>, m<metric>
const outputKey = z.string().regex(/^(time|level|channel|text|table|c\d{1,3}|g\d|m\d)$/)
const label = z.string().trim().min(1).max(120)

export const planFilterSchema = z.object({
  column: position,
  op: z.enum(FILTER_OPS),
  value: z.string().max(500).default(''),
  value2: z.string().max(500).optional(),
  // Take the values from an earlier step's output (op must be "in")
  from: z.object({ step: stepId, key: outputKey }).optional()
})

const messagesStep = z.object({
  id: stepId, title: label, op: z.literal('messages'),
  text: z.string().trim().max(200).optional(),
  levels: z.array(z.enum(LOG_LEVELS)).max(5).optional(),
  channel: z.string().max(100).optional(),
  table: z.uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50)
})
const findValueStep = z.object({
  id: stepId, title: label, op: z.literal('find_value'),
  value: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(200).default(50)
})
const tableRowsStep = z.object({
  id: stepId, title: label, op: z.literal('table_rows'),
  table: z.uuid(),
  filters: z.array(planFilterSchema).max(10).default([]),
  sort: z.object({ by: z.union([z.literal('ts'), position]), dir: z.enum(['asc', 'desc']) }).default({ by: 'ts', dir: 'desc' }),
  limit: z.number().int().min(1).max(200).default(50)
})
const tableSummaryStep = z.object({
  id: stepId, title: label, op: z.literal('table_summary'),
  table: z.uuid(),
  filters: z.array(planFilterSchema).max(10).default([]),
  groupBy: z.array(position).max(3).default([]),
  bucket: z.enum(['minute', 'hour', 'day', 'week', 'month']).nullable().default(null),
  metrics: z.array(z.object({ fn: z.enum(AGG_FNS), column: position.optional() })).min(1).max(4).default([{ fn: 'count' }]),
  sort: z.object({ by: z.string().regex(/^[mg]\d$/), dir: z.enum(['asc', 'desc']) }).optional(),
  limit: z.number().int().min(1).max(100).default(20)
})

export const planStepSchema = z.discriminatedUnion('op', [messagesStep, findValueStep, tableRowsStep, tableSummaryStep])

export const planSchema = z.object({
  title: label,
  explanation: z.string().trim().max(800).default(''),
  range: z.enum(PLAN_RANGES).default('24h'),
  steps: z.array(planStepSchema).min(1).max(MAX_STEPS)
}).superRefine((plan, ctx) => {
  const seen = new Set<string>()
  plan.steps.forEach((s, i) => {
    if (seen.has(s.id)) ctx.addIssue({ code: 'custom', message: `Step id ${s.id} is used twice.`, path: ['steps', i, 'id'] })
    if (s.op === 'table_rows' || s.op === 'table_summary') {
      s.filters.forEach((f, j) => {
        if (!f.from) return
        if (f.op !== 'in') ctx.addIssue({ code: 'custom', message: 'Values from another step need the "in" operator.', path: ['steps', i, 'filters', j] })
        if (!seen.has(f.from.step)) ctx.addIssue({ code: 'custom', message: `Step ${s.id} uses ${f.from.step} before it runs.`, path: ['steps', i, 'filters', j] })
      })
    }
    seen.add(s.id)
  })
})
export type Plan = z.infer<typeof planSchema>
// StepResult / StepColumn (the run output) are shared with the UI in shared/types/api.ts

const fail = (message: string) => createError({ statusCode: 400, statusMessage: message })

export function planFrom(range: Plan['range']) {
  const m = /^(\d+)([mhd])$/.exec(range)
  return m ? new Date(Date.now() - Number(m[1]) * RANGE_MS[m[2]!]!).toISOString() : undefined
}

// Distinct values of one output column, ready for an "in" filter (which splits on commas)
function chainValues(prev: StepResult, key: string) {
  const i = prev.columns.findIndex(c => c.key === key)
  if (i < 0) throw fail(`Step "${prev.title}" has no output column ${key}.`)
  const out = new Set<string>()
  for (const r of prev.rows) {
    const v = String(r[i] ?? '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    if (v && !v.includes(',')) out.add(v)
    if (out.size >= CHAIN_VALUES) break
  }
  return [...out].join(',')
}

// lockKey: one run at a time per person (ai-run:<user>) or per MCP key (mcp:<key>)
export async function runPlan(projectId: string, lockKey: string, sensitive: boolean, plan: Plan): Promise<StepResult[]> {
  const ids = [...new Set(plan.steps.flatMap(s => ('table' in s && s.table ? [s.table] : [])))]
  const t = schema.logTemplates
  const templates = ids.length
    ? await useDb().select().from(t).where(and(eq(t.projectId, projectId), inArray(t.id, ids)))
    : []
  if (templates.length !== ids.length) throw fail('The plan points at a table that is not in this project.')
  const byId = new Map(templates.map(x => [x.id, x]))
  const from = planFrom(plan.range)

  // The transaction only holds the run locks; log queries go to ClickHouse within the same time budget
  return useDb().transaction(async (tx) => {
    // One run per person at a time; parallel runs would fill the connection pool
    const [lock] = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${lockKey})) as ok`)
    if (!lock?.ok) throw createError({ statusCode: 429, statusMessage: 'Another plan of yours is still running. Wait for it to finish.' })
    // Many people or keys at once must not take every connection from ingest and sign-in
    const [slot] = await tx.execute<{ s: number }>(sql`select s from generate_series(0, ${RUN_SLOTS - 1}) s where pg_try_advisory_xact_lock(${SLOT_LOCK}, s) limit 1`)
    if (!slot) throw createError({ statusCode: 429, statusMessage: 'Plans are busy right now. Try again in a few seconds.' })
    // Column names are chosen by people or AI and could hold values; they follow the caller's masking
    const label = (s: string) => (sensitive ? s : maskText(s))
    const deadline = Date.now() + RUN_BUDGET_MS
    const done = new Map<string, StepResult>()

    return withChDeadline(deadline, async () => {
      for (const step of plan.steps) {
        const left = deadline - Date.now()
        if (left < 500) throw createError({ statusCode: 408, statusMessage: 'The plan took too long. Pick a shorter time range or fewer steps.' })
        const base = { id: step.id, title: step.title, op: step.op, total: null, note: null, tableId: null }

        if (step.op === 'messages') {
          const res = await queryLogs(projectId, sensitive, {
            q: step.text || undefined, channel: step.channel, template: step.table, level: step.levels?.length ? step.levels : undefined,
            from, limit: step.limit, order: 'desc', includeTotal: true, data: []
          })
          done.set(step.id, {
            ...base, total: res.total ?? null, tableId: step.table ?? null,
            columns: [{ key: 'time', label: 'Time', type: 'time' }, { key: 'level', label: 'Level', type: 'level' }, { key: 'channel', label: 'Channel', type: 'text' }, { key: 'text', label: 'Message', type: 'text' }],
            rows: res.items.map(r => [new Date(r.ts).toISOString(), r.level, r.channel, r.text])
          })
          continue
        }

        if (step.op === 'find_value') {
          const res = await searchValue(projectId, sensitive, { value: step.value, from, limit: step.limit })
          const names = new Map(res.tables.map(x => [x.templateId, sensitive ? x.name || x.pattern : maskText(x.name || x.pattern)]))
          done.set(step.id, {
            ...base,
            total: res.tables.reduce((s, x) => s + x.count, 0),
            note: res.capped ? 'Counted within the latest 10,000 matches.' : null,
            columns: [{ key: 'time', label: 'Time', type: 'time' }, { key: 'table', label: 'Table', type: 'text' }, { key: 'text', label: 'Message', type: 'text' }],
            rows: res.rows.map(r => [r.ts.toISOString(), names.get(r.templateId) ?? '', r.text])
          })
          continue
        }

        const template = byId.get(step.table)!
        const chained = step.filters.map(f => (f.from ? chainValues(done.get(f.from.step)!, f.from.key) : null))
        const filters = step.filters.map(f => ({ field: f.column, op: f.op, value2: f.value2, value: f.from ? '' : f.value }))
        // Chained lists can be longer than a typed filter value; filterSql caps them at 100 items
        const fill = <T extends { filters: { value: string }[] }>(body: T) => {
          chained.forEach((v, i) => { if (v !== null) body.filters[i]!.value = v })
          return body
        }
        const note = chained.some(v => v === '') ? 'An earlier step found no values to match, so this step is empty.' : null
        const fieldTypes = new Map(template.fields.map(f => [f.position, f.type]))

        if (step.op === 'table_rows') {
          const body = fill(tableQuerySchema.parse({ from, filters, mode: 'rows', sort: step.sort, limit: step.limit }))
          checkTableQuery(template, body)
          const res = await runTableRows(template, sensitive, body)
          done.set(step.id, {
            ...base, total: res.total, note, tableId: template.id,
            columns: [{ key: 'time', label: 'Time', type: 'time' }, ...template.fields.map(f => ({ key: `c${f.position}`, label: label(f.name), type: f.type }))],
            rows: res.rows.map(r => [r.ts.toISOString(), ...r.values])
          })
          continue
        }

        const body = fill(tableQuerySchema.parse({
          from, filters, mode: 'summary', groupBy: step.groupBy, bucket: step.bucket,
          metrics: step.metrics.map(m => ({ fn: m.fn, field: m.column })),
          sort: step.sort ?? { by: step.bucket ? 'g0' : 'm0', dir: step.bucket ? 'asc' : 'desc' }
        }))
        checkTableQuery(template, body)
        const res = await runTableSummary(template, sensitive, body, step.limit)
        const groupTypes: StepColumn['type'][] = [...(step.bucket ? ['time' as const] : []), ...step.groupBy.map(g => fieldTypes.get(g) ?? 'text')]
        done.set(step.id, {
          ...base, note: res.truncated ? `Showing the first ${step.limit} groups.` : note, tableId: template.id,
          columns: [
            ...res.columns.groups.map((l, i) => ({ key: `g${i}`, label: label(l), type: groupTypes[i] ?? 'text' })),
            ...res.columns.metrics.map((l, i) => ({ key: `m${i}`, label: label(l), type: 'number' as const }))
          ],
          rows: res.rows.map(r => [...r.groups, ...r.metrics])
        })
      }
      return [...done.values()]
    })
  }, { accessMode: 'read only' })
}
