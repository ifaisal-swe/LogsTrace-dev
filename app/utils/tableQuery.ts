export type FilterOp = 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'empty' | 'not_empty'
export type AggFn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct'
export type TableFilter = { field: number, op: FilterOp, value: string, value2?: string }
export type TableQuery = {
  range: string
  filters: TableFilter[]
  mode: 'rows' | 'summary'
  groupBy: number[]
  bucket: 'minute' | 'hour' | 'day' | 'week' | 'month' | null
  metrics: { fn: AggFn, field?: number }[]
  sort: { by: 'ts' | number | string, dir: 'asc' | 'desc' }
}

export const OP_ITEMS: { label: string, value: FilterOp }[] = [
  { label: 'is', value: 'eq' },
  { label: 'is not', value: 'neq' },
  { label: 'contains', value: 'contains' },
  { label: 'does not contain', value: 'not_contains' },
  { label: 'more than', value: 'gt' },
  { label: 'at least', value: 'gte' },
  { label: 'less than', value: 'lt' },
  { label: 'at most', value: 'lte' },
  { label: 'between', value: 'between' },
  { label: 'is one of', value: 'in' },
  { label: 'is empty', value: 'empty' },
  { label: 'is not empty', value: 'not_empty' }
]
export const NO_VALUE_OPS: FilterOp[] = ['empty', 'not_empty']

export const AGG_ITEMS: { label: string, value: AggFn }[] = [
  { label: 'Count', value: 'count' },
  { label: 'Sum of', value: 'sum' },
  { label: 'Average of', value: 'avg' },
  { label: 'Lowest', value: 'min' },
  { label: 'Highest', value: 'max' },
  { label: 'Distinct values of', value: 'count_distinct' }
]

export const RANGE_ITEMS = [
  { label: 'All time', value: 'all' },
  { label: 'Last 15 minutes', value: '15m' },
  { label: 'Last hour', value: '1h' },
  { label: 'Last 10 hours', value: '10h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' }
]

export function rangeFrom(range: string) {
  const m = /^(\d+)([mhd])$/.exec(range)
  if (!m) return undefined
  const ms = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 'm' | 'h' | 'd']
  return new Date(Date.now() - Number(m[1]) * ms).toISOString()
}

export const defaultQuery = (): TableQuery => ({
  range: 'all', filters: [], mode: 'rows', groupBy: [], bucket: null, metrics: [{ fn: 'count' }], sort: { by: 'ts', dir: 'desc' }
})

const bare = (v: string) => v.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase()
const toNum = (v: string) => {
  const s = v.replace(/[,$%]/g, '')
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : null
}

// Mirrors the server filters so live rows can be checked in the browser
export function rowMatches(values: Map<number, string>, filters: TableFilter[]) {
  return filters.every((f) => {
    const raw = values.get(f.field) ?? ''
    const v = f.value.trim()
    const n = toNum(raw)
    const arg = Number(v.replace(/[,$%\s]/g, ''))
    switch (f.op) {
      case 'eq': return raw.toLowerCase() === v.toLowerCase() || bare(raw) === v.toLowerCase()
      case 'neq': return !(raw.toLowerCase() === v.toLowerCase() || bare(raw) === v.toLowerCase())
      case 'contains': return raw.toLowerCase().includes(v.toLowerCase())
      case 'not_contains': return !raw.toLowerCase().includes(v.toLowerCase())
      case 'gt': return n !== null && n > arg
      case 'gte': return n !== null && n >= arg
      case 'lt': return n !== null && n < arg
      case 'lte': return n !== null && n <= arg
      case 'between': return n !== null && n >= arg && n <= Number((f.value2 ?? '').replace(/[,$%\s]/g, ''))
      case 'in': return v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).some(x => raw.toLowerCase() === x || bare(raw) === x)
      case 'empty': return raw === ''
      case 'not_empty': return raw !== ''
    }
    return true
  })
}
