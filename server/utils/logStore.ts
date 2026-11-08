import type { z } from 'zod'

// Every read and write of log messages. They live in ClickHouse; templates, projects and the rest stay in Postgres.

export type LogRow = {
  id: number
  ts: Date
  channel: string
  level: string
  text: string
  data: Record<string, unknown>
  templateId: string | null
  traceId: string | null
  spanId: string | null
}

type RawRow = Omit<LogRow, 'ts' | 'data' | 'traceId' | 'spanId'> & { ts: string, data: string, traceId: string, spanId: string }

const ROW_COLUMNS = ch.raw(`id, ts, channel, level, text, data, toString(template_id) AS templateId, trace_id AS traceId, span_id AS spanId`)

function toLogRow(r: RawRow): LogRow {
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(r.data || '{}')
  } catch { /* stored by us as JSON; keep {} if a row is ever malformed */ }
  return { id: Number(r.id), ts: new Date(r.ts), channel: r.channel, level: r.level, text: r.text, data, templateId: r.templateId || null, traceId: r.traceId || null, spanId: r.spanId || null }
}

// ── expressions ──────────────────────────────────────────────────────────────

const TEXT = ch.raw('text')

// Same rules as maskText() / maskedTextSql: replacements never add or remove spaces
const MASK_RULES_CH: [string, string][] = [
  ['Bearer([[:space:]]+)[\\pL\\pN_.~+/-]{16,}', 'Bearer\\1••••'],
  ['(sk|pk|rk|lgk|ghp|gho|xoxa|xoxb|xoxp)_[\\pL\\pN_-]{12,}', '••••'],
  ['[\\pL\\pN_.+-]+@[\\pL\\pN_-]+(\\.[\\pL\\pN_-]+)+', '••••@••••'],
  ['([0-9]{1,3}\\.){3}[0-9]{1,3}', '•.•.•.•'],
  ['([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}', '••••:••••'],
  // Structured events: value after a sensitive key (SENSITIVE_PAIR in mask.ts)
  ['(^|[[:space:]])(([\\pL\\pN_-]+\\.)*(?i:ip|ipv4|ipv6|email|phone|token|access_token|refresh_token|password|secret|authorization|api_?key):)([[:space:]]+)[^[:space:]]+', '\\1\\2\\4••••']
]
export const chMasked = (expr: ChSql) => MASK_RULES_CH.reduce((acc, [p, r]) => ch`replaceRegexpAll(${acc}, ${p}, ${r})`, expr)

// Text as the caller may see it: masked for roles without logs:read_sensitive
export const chVisible = (sensitive: boolean) => (sensitive ? TEXT : chMasked(TEXT))

// Same tokenising as drain.ts: drop markdown marks, collapse whitespace, split on spaces
export const chTokens = (expr: ChSql) =>
  ch`splitByChar(' ', trimBoth(replaceRegexpAll(replaceRegexpAll(${expr}, '\\\\*\\\\*|__|\`', ''), '[[:space:]\\\\p{Zs}]+', ' ')))`

const col = (pos: number) => ch.raw(`tk[${pos + 1}]`)
// "[12]", "ABC123," and "#12" should match 12 / ABC123
const bare = (v: ChSql) => ch`replaceRegexpAll(${v}, '^[^\\\\pL\\\\pN]+|[^\\\\pL\\\\pN]+$', '')`
// Numbers like 50,000 / $50000 / 12.5% compare numerically; anything else is NULL
const num = (v: ChSql) => ch`if(match(replaceRegexpAll(${v}, '[,$%]', ''), '^[-+]?[0-9]+(\\\\.[0-9]+)?$'), toFloat64OrNull(replaceRegexpAll(${v}, '[,$%]', '')), NULL)`
const likeEscape = (v: string) => `%${v.replace(/[%_\\]/g, m => `\\${m}`)}%`

function numberArg(value: string) {
  const n = Number(value.replace(/[,$%\s]/g, ''))
  if (!Number.isFinite(n)) throw createError({ statusCode: 400, statusMessage: `"${value}" is not a number.` })
  return n
}

type Filter = z.infer<typeof filterSchema>
type Range = z.infer<typeof rangeSchema>

function filterCh(f: Filter): ChSql {
  const c = col(f.field)
  const v = f.value.trim()
  const same = ch`(lowerUTF8(${c}) = lowerUTF8(${v}) OR lowerUTF8(${bare(c)}) = lowerUTF8(${v}))`
  switch (f.op) {
    case 'eq': return same
    case 'neq': return ch`NOT ${same}`
    case 'contains': return ch`ilike(${c}, ${likeEscape(v)})`
    case 'not_contains': return ch`NOT ilike(${c}, ${likeEscape(v)})`
    case 'gt': return ch`${num(c)} > ${numberArg(v)}`
    case 'gte': return ch`${num(c)} >= ${numberArg(v)}`
    case 'lt': return ch`${num(c)} < ${numberArg(v)}`
    case 'lte': return ch`${num(c)} <= ${numberArg(v)}`
    case 'between': return ch`${num(c)} BETWEEN ${numberArg(v)} AND ${numberArg(f.value2 ?? '')}`
    case 'in': {
      const list = v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 100)
      if (!list.length) return ch.raw('0')
      return ch`(lowerUTF8(${c}) IN ${list} OR lowerUTF8(${bare(c)}) IN ${list})`
    }
    case 'empty': return ch`${c} = ''`
    case 'not_empty': return ch`${c} != ''`
  }
}

const rangeCh = (r: Range) => [
  r.from ? ch`ts >= ${new Date(r.from)}` : undefined,
  r.to ? ch`ts <= ${new Date(r.to)}` : undefined
]

const BUCKETS = {
  minute: 'toStartOfMinute(ts)',
  hour: 'toStartOfHour(ts)',
  day: 'toStartOfDay(ts)',
  week: 'toMonday(ts)',
  month: 'toStartOfMonth(ts)'
} as const
export type Bucket = keyof typeof BUCKETS
const bucketCh = (b: Bucket) => ch.raw(`toDateTime(${BUCKETS[b]}, 'UTC')`)

function cursorCh(cursor: string | undefined) {
  const c = parseCursor(cursor)
  return c ? ch`(ts < ${c.ts} OR (ts = ${c.ts} AND id < ${c.id}))` : undefined
}

// ── writes and deletes ───────────────────────────────────────────────────────

export type NewLogRow = Omit<LogRow, 'id' | 'ts'> & { projectId: string, apiKeyId: string | null, ts: Date, embed: unknown }

// Ids come from a Postgres sequence (one round trip per batch) so they stay numeric and ordered
export async function insertLogs(rows: NewLogRow[]): Promise<LogRow[]> {
  if (!rows.length) return []
  const ids = await useDbClient()<{ id: string }[]>`select nextval('log_event_ids') as id from generate_series(1, ${rows.length})`
  const receivedAt = new Date()
  const withIds = rows.map((r, i) => ({ ...r, id: Number(ids[i]!.id), receivedAt }))
  await chInsertLogEvents(withIds)
  return withIds.map(r => ({ id: r.id, ts: r.ts, channel: r.channel, level: r.level, text: r.text, data: r.data, templateId: r.templateId, traceId: r.traceId, spanId: r.spanId }))
}

export type LogDeleteFilter = { before?: Date, templateId?: string, channel?: string, ids?: number[] }

export async function countLogs(projectIds: string[], filter: LogDeleteFilter = {}) {
  if (!projectIds.length) return 0
  const [row] = await chRows<{ n: number }>(ch`SELECT count() AS n FROM log_events WHERE ${ch.and([
    ch`project_id IN ${ch.uuids(projectIds)}`,
    filter.before ? ch`ts < ${filter.before}` : undefined,
    filter.templateId ? ch`template_id = ${ch.uuid(filter.templateId)}` : undefined,
    filter.channel !== undefined ? ch`channel = ${filter.channel}` : undefined,
    filter.ids ? ch`id IN ${filter.ids}` : undefined
  ])}`)
  return Number(row?.n ?? 0)
}

// Counts first so nothing is deleted (and no mutation queued) when no rows match
export async function deleteLogs(projectIds: string[], filter: LogDeleteFilter = {}) {
  const n = await countLogs(projectIds, filter)
  if (n) await chDeleteLogEvents({ projectIds, ...filter })
  return n
}

// ── logs list, trace, live ───────────────────────────────────────────────────

export async function queryLogs(projectId: string, sensitive: boolean, f: LogQuery & { data: DataFilter[] }) {
  const where: (ChSql | undefined)[] = [ch`project_id = ${ch.uuid(projectId)}`]
  if (f.q) where.push(ch`ilike(${chVisible(sensitive)}, ${likeEscape(f.q)})`)
  if (f.channel !== undefined) {
    const list = f.channel.split(',').map(x => x.trim()).filter(Boolean)
    where.push(list.length > 1 ? ch`channel IN ${list}` : ch`channel = ${f.channel}`)
  }
  if (f.template) where.push(ch`template_id = ${ch.uuid(f.template)}`)
  if (f.level?.length) where.push(ch`level IN ${f.level}`)
  if (f.trace) where.push(ch`trace_id = ${f.trace}`)
  if (f.from) where.push(ch`ts >= ${new Date(f.from)}`)
  if (f.to) where.push(ch`ts <= ${new Date(f.to)}`)
  for (const d of f.data) {
    const segments = d.path.split('.')
    // Masked roles can't filter on hidden fields, or match raw values that they only see masked
    if (!sensitive && segments.some(s => SENSITIVE_KEYS.test(s))) {
      throw createError({ statusCode: 403, statusMessage: `"${d.path}" is hidden for your role, so it can't be filtered on.` })
    }
    const path = ch.join(segments.map(s => ch`${s}`))
    const type = ch`JSONType(data, ${path})`
    // Only plain values: an object's JSON text would expose nested fields that masking hides by key
    where.push(ch`${type} IN ('String', 'Int64', 'UInt64', 'Double', 'Bool')`)
    const value = ch`if(${type} = 'String', JSONExtractString(data, ${path}), JSONExtractRaw(data, ${path}))`
    where.push(ch`${sensitive ? value : chMasked(value)} = ${d.value}`)
  }
  if (f.order === 'desc') where.push(cursorCh(f.cursor))

  const dir = ch.raw(f.order === 'asc' ? 'ASC' : 'DESC')
  const cond = ch.and(where)
  const raw = await chRows<RawRow>(ch`SELECT ${ROW_COLUMNS} FROM log_events WHERE ${cond}
    ORDER BY ts ${dir}, id ${dir} LIMIT ${f.limit + 1} OFFSET ${f.offset ?? 0}`)
  const rows = raw.map(toLogRow)

  const page = rows.slice(0, f.limit)
  const items = page.map(r => sensitive ? r : { ...r, text: maskText(r.text), data: maskData(r.data) as Record<string, unknown> })
  let total: number | undefined
  if (f.includeTotal) {
    const [row] = await chRows<{ n: number }>(ch`SELECT count() AS n FROM log_events WHERE ${cond}`)
    total = Number(row?.n ?? 0)
  }
  return {
    items,
    hasMore: rows.length > f.limit,
    nextCursor: f.order === 'desc' && rows.length > f.limit ? encodeCursor(page.at(-1)!) : null,
    total
  }
}

export async function logsByIds(projectId: string, ids: number[]) {
  if (!ids.length) return []
  const raw = await chRows<RawRow>(ch`SELECT ${ROW_COLUMNS} FROM log_events
    WHERE project_id = ${ch.uuid(projectId)} AND id IN ${ids} ORDER BY ts DESC, id DESC`)
  return raw.map(toLogRow)
}

// Newest messages of one table, for its page
export async function templateMessages(projectId: string, templateId: string, cursor: string | undefined, limit: number) {
  const raw = await chRows<{ id: number, ts: string, text: string }>(ch`SELECT id, ts, text FROM log_events
    WHERE ${ch.and([ch`project_id = ${ch.uuid(projectId)}`, ch`template_id = ${ch.uuid(templateId)}`, cursorCh(cursor)])}
    ORDER BY ts DESC, id DESC LIMIT ${limit}`)
  return raw.map(r => ({ id: Number(r.id), ts: new Date(r.ts), text: r.text }))
}

// A few recent messages per table (AI catalog samples)
export async function recentTexts(projectId: string, templateIds: string[], perTemplate: number) {
  if (!templateIds.length) return []
  return chRows<{ id: string, text: string }>(ch`SELECT toString(template_id) AS id, text FROM log_events
    WHERE project_id = ${ch.uuid(projectId)} AND template_id IN ${ch.uuids(templateIds)}
    ORDER BY ts DESC LIMIT ${perTemplate} BY template_id`)
}

// ── tables (templates) ───────────────────────────────────────────────────────

type Template = typeof schema.logTemplates.$inferSelect

// One row per message of the table with its visible tokens as `tk`; filters and aggregates read tk[n]
function templateSource(template: Template, sensitive: boolean, range: Range) {
  const where = ch.and([ch`project_id = ${ch.uuid(template.projectId)}`, ch`template_id = ${ch.uuid(template.id)}`, ...rangeCh(range)])
  return ch`(SELECT id, ts, ${chTokens(chVisible(sensitive))} AS tk FROM log_events WHERE ${where}) AS s`
}
const whereCh = (filters: Filter[]) => (filters.length ? ch`WHERE ${ch.and(filters.map(filterCh))}` : ch.raw(''))

// Rows of one table; `limit` overrides body.limit (CSV export) and paging is skipped then
export async function runTableRows(template: Template, sensitive: boolean, body: TableQueryBody, limit = body.limit, offset = body.page * body.limit) {
  const fieldAt = new Map(template.fields.map(f => [f.position, f]))
  const source = templateSource(template, sensitive, body)
  const where = whereCh(body.filters)
  const dir = ch.raw(body.sort.dir === 'asc' ? 'ASC' : 'DESC')
  let order: ChSql
  if (body.sort.by === 'ts') order = ch`ts ${dir}, id ${dir}`
  else if (typeof body.sort.by === 'number') {
    const c = col(body.sort.by)
    order = fieldAt.get(body.sort.by)?.type === 'number'
      ? ch`${num(c)} ${dir} NULLS LAST, ts DESC`
      : ch`${c} ${dir}, ts DESC`
  } else throw createError({ statusCode: 400, statusMessage: 'Invalid sort' })

  const rows = await chRows<{ id: number, ts: string, tk: string[] }>(ch`SELECT id, ts, tk FROM ${source} ${where} ORDER BY ${order} LIMIT ${limit + 1} OFFSET ${offset}`)
  const [count] = await chRows<{ total: number }>(ch`SELECT count() AS total FROM ${source} ${where}`)
  return {
    total: Number(count?.total ?? 0),
    hasMore: rows.length > limit,
    rows: rows.slice(0, limit).map(r => ({
      id: Number(r.id),
      ts: new Date(r.ts),
      values: template.fields.map(f => r.tk[f.position] ?? '')
    }))
  }
}

// Group by columns and/or time, aggregate
export async function runTableSummary(template: Template, sensitive: boolean, body: TableQueryBody, limit = 500) {
  const fieldAt = new Map(template.fields.map(f => [f.position, f]))
  const groups: { label: string, expr: ChSql }[] = []
  if (body.bucket) groups.push({ label: body.bucket, expr: ch`formatDateTime(${bucketCh(body.bucket)}, '%Y-%m-%dT%H:%i:%SZ', 'UTC')` })
  for (const g of body.groupBy) groups.push({ label: fieldAt.get(g)?.name ?? `column ${g}`, expr: col(g) })
  const metrics = body.metrics.map((m) => {
    const c = m.field !== undefined ? col(m.field) : null
    const name = m.field !== undefined ? fieldAt.get(m.field)?.name ?? `column ${m.field}` : ''
    const expr = m.fn === 'count' ? ch.raw('count()')
      : m.fn === 'count_distinct' ? ch`uniqExact(lowerUTF8(${c!}))`
        // Rounded so float sums don't show 0.30000000000000004
        : ch`round(${ch.raw(m.fn)}(${num(c!)}), 10)`
    return { label: m.fn === 'count' ? 'Count' : `${METRIC_LABEL[m.fn]} of ${name}`, expr }
  })

  const select = ch.join([
    ...groups.map((g, i) => ch`${g.expr} AS ${ch.raw(`g${i}`)}`),
    ...metrics.map((m, i) => ch`${m.expr} AS ${ch.raw(`m${i}`)}`)
  ])
  const groupClause = groups.length ? ch.raw(`GROUP BY ${groups.map((_, i) => `g${i}`).join(', ')}`) : ch.raw('')

  const sortKey = typeof body.sort.by === 'string' && /^[mg]\d$/.test(body.sort.by) ? body.sort.by : null
  const validSort = sortKey && (sortKey[0] === 'm' ? Number(sortKey[1]) < metrics.length : Number(sortKey[1]) < groups.length)
  // Group columns break ties so equal counts always come back in the same order
  const tie = groups.map((_, i) => `, g${i}`).join('')
  const order = validSort
    ? ch.raw(`ORDER BY ${sortKey} ${body.sort.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST${tie}`)
    : body.bucket ? ch.raw(`ORDER BY g0 ASC${tie.replace(', g0', '')}`) : metrics.length ? ch.raw(`ORDER BY m0 DESC NULLS LAST${tie}`) : ch.raw('')

  const source = templateSource(template, sensitive, body)
  const result = await chRows<Record<string, unknown>>(ch`SELECT ${select} FROM ${source} ${whereCh(body.filters)} ${groupClause} ${order} LIMIT ${limit + 1}`)
  return {
    columns: { groups: groups.map(g => g.label), metrics: metrics.map(m => m.label) },
    truncated: result.length > limit,
    rows: result.slice(0, limit).map(r => ({
      groups: groups.map((_, i) => String(r[`g${i}`] ?? '')),
      metrics: metrics.map((_, i) => finite(r[`m${i}`]))
    }))
  }
}

const finite = (v: unknown) => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const BINS = 20

// Shape of one column under the current filters: top values, emptiness and, for numbers, spread
export async function profileColumn(template: Template, sensitive: boolean, body: Range & { field: number, filters: Filter[] }) {
  const source = templateSource(template, sensitive, body)
  const where = whereCh(body.filters)
  const c = col(body.field)
  const n = num(c)

  const [stats] = await chRows<{ total: number, empty: number, distinct: number, numbers: number, min: number | null, max: number | null, avg: number | null, p50: number | null, p95: number | null }>(ch`
    SELECT count() AS total, countIf(${c} = '') AS empty, uniqExact(lowerUTF8(${c})) AS distinct, count(${n}) AS numbers,
      min(${n}) AS min, max(${n}) AS max, avg(${n}) AS avg,
      quantileExactInclusive(0.5)(${n}) AS p50, quantileExactInclusive(0.95)(${n}) AS p95
    FROM ${source} ${where}`)
  const s = stats!
  const top = await chRows<{ value: string, n: number }>(ch`
    SELECT ${c} AS value, count() AS n FROM ${source} ${where}
    GROUP BY value ORDER BY n DESC, value ASC LIMIT 10`)

  // Treat the column as numeric when most non-empty values parse as numbers
  const total = Number(s.total)
  const numbers = Number(s.numbers)
  const nonEmpty = total - Number(s.empty)
  const numeric = numbers > 0 && numbers >= nonEmpty * 0.8
  const lo = finite(s.min)
  const hi = finite(s.max)
  let histogram: { from: number, to: number, n: number }[] = []
  if (numeric && lo !== null && hi !== null) {
    if (lo === hi) {
      histogram = [{ from: lo, to: hi, n: numbers }]
    } else {
      const rows = await chRows<{ b: number, n: number }>(ch`
        SELECT greatest(1, least(toInt64(floor((${n} - ${lo}) / ${hi - lo} * ${BINS})) + 1, ${BINS})) AS b, count() AS n
        FROM ${source} WHERE ${ch.and([...body.filters.map(filterCh), ch`${n} IS NOT NULL`])}
        GROUP BY b ORDER BY b`)
      const width = (hi - lo) / BINS
      const counts = new Map(rows.map(r => [Number(r.b), Number(r.n)]))
      histogram = Array.from({ length: BINS }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, n: counts.get(i + 1) ?? 0 }))
    }
  }

  return {
    total,
    empty: Number(s.empty),
    distinct: Number(s.distinct),
    top: top.map(r => ({ value: r.value ?? '', n: Number(r.n) })),
    numbers: numeric
      ? { count: numbers, min: lo, max: hi, avg: finite(s.avg), p50: finite(s.p50), p95: finite(s.p95), histogram }
      : null,
    masked: !sensitive
  }
}

// Hourly counts per table for the last 24 hours; index 23 is the current hour
export async function templateSparklines(projectId: string) {
  const rows = await chRows<{ id: string, h: number, n: number }>(ch`
    SELECT toString(template_id) AS id,
      toInt32(23 - dateDiff('hour', toStartOfHour(ts), toStartOfHour(now64(3, 'UTC')))) AS h,
      count() AS n
    FROM log_events
    WHERE project_id = ${ch.uuid(projectId)} AND ts >= toStartOfHour(now64(3, 'UTC')) - INTERVAL 23 HOUR AND template_id IS NOT NULL
    GROUP BY id, h`)
  const spark = new Map<string, number[]>()
  for (const r of rows) {
    if (r.h < 0 || r.h > 23) continue
    const list = spark.get(r.id) ?? Array<number>(24).fill(0)
    list[r.h] = Number(r.n)
    spark.set(r.id, list)
  }
  return spark
}

// ── search by value ──────────────────────────────────────────────────────────

// Per-table counts look at this many of the most recent matches
export const VALUE_COUNT_WINDOW = 10_000

export async function findValue(projectId: string, sensitive: boolean, q: Range & { value: string, template?: string, limit: number }) {
  const visible = chVisible(sensitive)
  const inner = ch.and([
    ch`project_id = ${ch.uuid(projectId)}`,
    // Cheap substring pass first; the token check below keeps only whole-word matches
    ch`ilike(${visible}, ${likeEscape(q.value)})`,
    ...rangeCh(q),
    q.template ? ch`template_id = ${ch.uuid(q.template)}` : undefined
  ])
  // Aliases differ from column names: ClickHouse lets an alias shadow the column inside WHERE
  const source = ch`(SELECT id, ts, channel, level, toString(template_id) AS tid, ${chTokens(visible)} AS tk
    FROM log_events WHERE ${inner} ORDER BY ts DESC, id DESC LIMIT ${VALUE_COUNT_WINDOW}) AS s`
  const match = ch`arrayExists(u -> lowerUTF8(u) = lowerUTF8(${q.value}) OR lowerUTF8(${bare(ch.raw('u'))}) = lowerUTF8(${q.value}), tk)`

  const rows = await chRows<{ id: number, ts: string, channel: string, level: string, tid: string | null, tk: string[] }>(
    ch`SELECT * FROM ${source} WHERE ${match} ORDER BY ts DESC, id DESC LIMIT ${q.limit}`)
  const counts = await chRows<{ tid: string | null, n: number, last: string }>(
    ch`SELECT tid, count() AS n, max(ts) AS last FROM ${source} WHERE ${match} GROUP BY tid ORDER BY n DESC, last DESC`)
  return {
    rows: rows.map(r => ({ id: Number(r.id), ts: new Date(r.ts), channel: r.channel, level: r.level, templateId: r.tid || null, tk: r.tk })),
    counts: counts.map(c => ({ templateId: c.tid || null, n: Number(c.n), last: new Date(c.last) }))
  }
}

// ── charts and stats ─────────────────────────────────────────────────────────

const SPLIT_KEY = { none: `''`, level: 'level', channel: 'channel', table: `ifNull(toString(template_id), '')` } as const

// Message counts for dashboards: busiest keys first, then per bucket for those keys
export async function volume(projectId: string, body: Range & { bucket: Bucket | null, split: keyof typeof SPLIT_KEY, channel?: string, level?: string }, maxKeys: number) {
  const key = ch.raw(SPLIT_KEY[body.split])
  const where = ch.and([
    ch`project_id = ${ch.uuid(projectId)}`,
    ...rangeCh(body),
    body.channel !== undefined ? ch`channel = ${body.channel}` : undefined,
    body.level ? ch`level = ${body.level}` : undefined
  ])
  const top = await chRows<{ k: string, n: number }>(ch`SELECT ${key} AS k, count() AS n FROM log_events WHERE ${where}
    GROUP BY k ORDER BY n DESC, k LIMIT ${maxKeys + 1}`)
  const keys = top.slice(0, maxKeys).map(r => r.k)
  let rows: { t: string | null, k: string, n: number }[] = top.slice(0, maxKeys).map(r => ({ t: null, k: r.k, n: Number(r.n) }))
  if (body.bucket && keys.length) {
    const res = await chRows<{ t: string, k: string, n: number }>(ch`SELECT ${bucketCh(body.bucket)} AS t, ${key} AS k, count() AS n
      FROM log_events WHERE ${where} AND ${key} IN ${keys}
      GROUP BY t, k ORDER BY t, k LIMIT 20000`)
    rows = res.map(r => ({ t: new Date(r.t).toISOString(), k: r.k, n: Number(r.n) }))
  }
  return { rows, keys, capped: top.length > maxKeys }
}

const SPANS = { '24 hours': 'INTERVAL 24 HOUR', '7 days': 'INTERVAL 7 DAY', '30 days': 'INTERVAL 30 DAY' } as const

// Message counts per time bucket and level, for the overview chart
export async function activity(projectId: string, bucket: 'hour' | 'day', span: keyof typeof SPANS) {
  const rows = await chRows<{ t: string, level: string, n: number }>(ch`
    SELECT ${bucketCh(bucket)} AS t, level, count() AS n FROM log_events
    WHERE project_id = ${ch.uuid(projectId)} AND ts > now64(3, 'UTC') - ${ch.raw(SPANS[span])}
    GROUP BY t, level ORDER BY t, level`)
  return rows.map(r => ({ t: new Date(r.t).toISOString(), level: r.level, n: Number(r.n) }))
}

export async function projectStats(projectId: string) {
  const [row] = await chRows<{ total: number, last24h: number, last: string }>(ch`
    SELECT count() AS total, countIf(ts > now64(3, 'UTC') - INTERVAL 24 HOUR) AS last24h, max(ts) AS last
    FROM log_events WHERE project_id = ${ch.uuid(projectId)}`)
  const channels = await chRows<{ channel: string, n: number }>(ch`
    SELECT channel, count() AS n FROM log_events
    WHERE project_id = ${ch.uuid(projectId)} AND ts > now64(3, 'UTC') - INTERVAL 7 DAY
    GROUP BY channel ORDER BY n DESC, channel LIMIT 12`)
  const total = Number(row?.total ?? 0)
  return {
    total,
    last24h: Number(row?.last24h ?? 0),
    // max() of no rows is the epoch, not NULL
    lastEvent: total && row ? new Date(row.last) : null,
    channels: channels.map(c => ({ channel: c.channel, n: Number(c.n) }))
  }
}

// 24h count and last message time for many projects at once (project switcher)
export async function projectsActivity(projectIds: string[]) {
  const out = new Map<string, { last24h: number, lastEvent: Date }>()
  if (!projectIds.length) return out
  const rows = await chRows<{ id: string, last24h: number, last: string }>(ch`
    SELECT toString(project_id) AS id, countIf(ts > now64(3, 'UTC') - INTERVAL 24 HOUR) AS last24h, max(ts) AS last
    FROM log_events WHERE project_id IN ${ch.uuids(projectIds)} GROUP BY project_id`)
  for (const r of rows) out.set(r.id, { last24h: Number(r.last24h), lastEvent: new Date(r.last) })
  return out
}

export async function totalLogs() {
  const [row] = await chRows<{ n: number }>(ch`SELECT count() AS n FROM log_events`)
  return Number(row?.n ?? 0)
}

// Volume alert check: stops counting once the threshold is reached
export async function countRecent(projectId: string, c: { windowMinutes: number, threshold: number, level?: string, channel?: string, templateId?: string }) {
  const where = ch.and([
    ch`project_id = ${ch.uuid(projectId)}`,
    ch`ts > now64(3, 'UTC') - toIntervalMinute(${c.windowMinutes})`,
    c.level ? ch`level = ${c.level}` : undefined,
    c.channel !== undefined ? ch`channel = ${c.channel}` : undefined,
    c.templateId ? ch`template_id = ${ch.uuid(c.templateId)}` : undefined
  ])
  const [row] = await chRows<{ n: number }>(ch`SELECT count() AS n FROM (SELECT 1 FROM log_events WHERE ${where} LIMIT ${c.threshold})`)
  return Number(row?.n ?? 0)
}
