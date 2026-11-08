import { AsyncLocalStorage } from 'node:async_hooks'

// Tagged SQL for ClickHouse: every interpolated value becomes a typed query parameter ({p0:String}),
// fragments nest, and only ch.raw() inserts text as-is (never use it with user input).
type Chunk = string | { value: unknown, type: string }

export class ChSql {
  constructor(readonly chunks: Chunk[]) {}
}

const DT64 = 'DateTime64(3, \'UTC\')'

function inferType(v: unknown): string {
  if (typeof v === 'string') return 'String'
  if (typeof v === 'number') return Number.isInteger(v) ? 'Int64' : 'Float64'
  if (typeof v === 'boolean') return 'Bool'
  if (v instanceof Date) return DT64
  if (Array.isArray(v)) {
    if (v.every(x => typeof x === 'string')) return 'Array(String)'
    if (v.every(x => typeof x === 'number' && Number.isInteger(x))) return 'Array(Int64)'
  }
  throw new Error(`Unsupported ClickHouse parameter: ${typeof v}`)
}

export function ch(strings: TemplateStringsArray, ...values: unknown[]): ChSql {
  const chunks: Chunk[] = []
  strings.forEach((s, i) => {
    chunks.push(s)
    if (i < values.length) {
      const v = values[i]
      if (v instanceof ChSql) chunks.push(...v.chunks)
      else chunks.push({ value: v, type: inferType(v) })
    }
  })
  return new ChSql(chunks)
}

ch.raw = (text: string) => new ChSql([text])
ch.param = (value: unknown, type: string) => new ChSql([{ value, type }])
ch.uuid = (id: string) => ch.param(id, 'UUID')
ch.uuids = (ids: string[]) => ch.param(ids, 'Array(UUID)')
ch.join = (list: ChSql[], sep = ', ') => new ChSql(list.flatMap((q, i) => (i ? [sep, ...q.chunks] : q.chunks)))
ch.and = (list: (ChSql | undefined)[]) => {
  const parts = list.filter((x): x is ChSql => !!x)
  return parts.length ? ch.join(parts.map(p => ch`(${p})`), ' AND ') : ch.raw('1')
}

const chTime = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '')

export function renderCh(q: ChSql) {
  let query = ''
  const params: Record<string, unknown> = {}
  let n = 0
  for (const c of q.chunks) {
    if (typeof c === 'string') {
      query += c
      continue
    }
    const name = `p${n++}`
    params[name] = c.value instanceof Date ? chTime(c.value) : c.value
    query += `{${name}:${c.type}}`
  }
  return { query, params }
}

// AI plans share one time budget across steps; ClickHouse enforces what is left of it
const deadline = new AsyncLocalStorage<number>()
export const withChDeadline = <T>(at: number, fn: () => Promise<T>) => deadline.run(at, fn)

export async function chRows<T>(q: ChSql): Promise<T[]> {
  const client = useClickHouse()
  const { query, params } = renderCh(q)
  const until = deadline.getStore()
  const seconds = until ? Math.max(1, Math.ceil((until - Date.now()) / 1000)) : 30
  const rs = await client.query({
    query,
    query_params: params,
    format: 'JSONEachRow',
    clickhouse_settings: {
      max_execution_time: seconds,
      // Counts and ids as JSON numbers, times as ISO strings
      output_format_json_quote_64bit_integers: 0,
      date_time_output_format: 'iso'
    }
  })
  return rs.json<T>()
}
