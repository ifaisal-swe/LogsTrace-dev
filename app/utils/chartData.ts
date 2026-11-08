export type Bucket = 'minute' | 'hour' | 'day' | 'week' | 'month'

export const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
const MAX_SERIES = SERIES_COLORS.length
const MAX_POINTS = 1500

function step(d: Date, bucket: Bucket) {
  const n = new Date(d)
  if (bucket === 'minute') n.setUTCMinutes(n.getUTCMinutes() + 1)
  else if (bucket === 'hour') n.setUTCHours(n.getUTCHours() + 1)
  else if (bucket === 'day') n.setUTCDate(n.getUTCDate() + 1)
  else if (bucket === 'week') n.setUTCDate(n.getUTCDate() + 7)
  else n.setUTCMonth(n.getUTCMonth() + 1)
  return n
}

// Every bucket between first and last, so empty periods show as gaps instead of disappearing
export function fillTimes(times: string[], bucket: Bucket) {
  if (!times.length) return []
  const sorted = [...times].sort()
  const out: string[] = []
  const end = new Date(sorted.at(-1)!).getTime()
  for (let d = new Date(sorted[0]!); d.getTime() <= end && out.length < MAX_POINTS; d = step(d, bucket)) out.push(d.toISOString())
  return out
}

export const isAdditive = (fn: string) => fn === 'count' || fn === 'sum'

// Summary rows (time bucket first, then group columns) → one series per group; the rest fold into "Other"
export function summaryToSeries(
  rows: { groups: string[], metrics: (number | null)[] }[],
  bucket: Bucket,
  fn: string,
  metricLabel: string,
  // Optional [start, end] so the axis covers the whole selected range
  span?: [string, string]
) {
  const additive = isAdditive(fn)
  const keyOf = (r: { groups: string[] }) => r.groups.slice(1).map(g => g || '(empty)').join(' · ') || metricLabel
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(keyOf(r), (totals.get(keyOf(r)) ?? 0) + Math.abs(r.metrics[0] ?? 0))
  const ranked = [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)!)
  const keep = ranked.slice(0, MAX_SERIES)
  const folded = ranked.length - keep.length
  const withOther = additive && folded > 0

  const times = fillTimes([...new Set(rows.map(r => r.groups[0] ?? ''))].filter(Boolean).concat(span ?? []), bucket)
  const index = new Map(times.map((t, i) => [new Date(t).getTime(), i]))
  const blank = () => Array<number | null>(times.length).fill(additive ? 0 : null)
  const values = new Map(keep.map(k => [k, blank()]))
  const other = blank()

  for (const r of rows) {
    const i = index.get(new Date(r.groups[0] ?? '').getTime())
    const v = r.metrics[0] ?? null
    if (i === undefined || v === null) continue
    const list = values.get(keyOf(r))
    if (list) list[i] = additive ? (list[i] ?? 0) + v : v
    else if (withOther) other[i] = (other[i] ?? 0) + v
  }

  const series = keep.map((k, i) => ({ name: k, color: keep.length === 1 ? 'var(--chart-single)' : SERIES_COLORS[i]!, values: values.get(k)! }))
  if (withOther) series.push({ name: `Other (${folded})`, color: 'var(--chart-other)', values: other })
  return { times, series, hidden: withOther ? 0 : folded, mode: additive ? 'stack' as const : 'line' as const }
}

// Start of the bucket containing d, matching Postgres date_trunc(…, 'UTC')
export function truncTo(d: Date, bucket: Bucket) {
  const n = new Date(d)
  n.setUTCSeconds(0, 0)
  if (bucket === 'minute') return n
  n.setUTCMinutes(0)
  if (bucket === 'hour') return n
  n.setUTCHours(0)
  if (bucket === 'day') return n
  if (bucket === 'week') {
    n.setUTCDate(n.getUTCDate() - ((n.getUTCDay() + 6) % 7))
    return n
  }
  n.setUTCDate(1)
  return n
}
