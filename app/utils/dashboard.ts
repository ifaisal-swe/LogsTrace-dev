export const DASH_RANGES = [
  { label: 'Last 15 minutes', value: '15m' },
  { label: 'Last hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' }
]

export const REFRESH_ITEMS = [
  { label: 'Auto-refresh off', value: 0 },
  { label: 'Every 10 s', value: 10 },
  { label: 'Every 30 s', value: 30 },
  { label: 'Every minute', value: 60 },
  { label: 'Every 5 minutes', value: 300 }
]

const MS = { m: 60_000, h: 3_600_000, d: 86_400_000 }

// Bucket size that gives roughly 15–200 points for the range, like Grafana's auto interval
export function autoBucket(range: string): Bucket {
  const ms = rangeMs(range)
  if (ms <= 3 * MS.h) return 'minute'
  if (ms <= 8 * MS.d) return 'hour'
  if (ms <= 120 * MS.d) return 'day'
  return 'week'
}

export function rangeMs(range: string) {
  const m = /^(\d+)([mhd])$/.exec(range)
  return m ? Number(m[1]) * MS[m[2] as 'm' | 'h' | 'd'] : 30 * MS.d
}

// from (ISO) for the API and the [start, end] buckets for the chart axis
export function rangeWindow(range: string, bucket: Bucket) {
  const now = new Date()
  const from = new Date(now.getTime() - rangeMs(range))
  return { from: from.toISOString(), span: [truncTo(from, bucket).toISOString(), truncTo(now, bucket).toISOString()] as [string, string] }
}

export const PANEL_TYPES: { label: string, value: PanelType, icon: string }[] = [
  { label: 'Time series', value: 'timeseries', icon: 'i-lucide-chart-column' },
  { label: 'Bars (ranked)', value: 'bars', icon: 'i-lucide-chart-bar' },
  { label: 'Stat', value: 'stat', icon: 'i-lucide-hash' },
  { label: 'Table', value: 'table', icon: 'i-lucide-table' },
  { label: 'Logs', value: 'logs', icon: 'i-lucide-list' }
]
export const WIDTHS = [
  { label: 'Quarter', value: 3 },
  { label: 'Third', value: 4 },
  { label: 'Half', value: 6 },
  { label: 'Two thirds', value: 8 },
  { label: 'Full width', value: 12 }
]
export const HEIGHTS = [
  { label: 'Small', value: 's' },
  { label: 'Medium', value: 'm' },
  { label: 'Large', value: 'l' }
]
export const PANEL_HEIGHT = { s: 120, m: 220, l: 360 } as const
// Literal class names so Tailwind keeps them
export const SPAN_CLASS = { 3: 'md:col-span-6 xl:col-span-3', 4: 'md:col-span-6 xl:col-span-4', 6: 'md:col-span-6', 8: 'md:col-span-12 xl:col-span-8', 12: 'md:col-span-12' } as const

export const LEVEL_SERIES: Record<string, { name: string, color: string }> = {
  fatal: { name: 'Fatal', color: 'var(--chart-fatal)' },
  error: { name: 'Error', color: 'var(--chart-error)' },
  warn: { name: 'Warning', color: 'var(--chart-warn)' },
  info: { name: 'Info', color: 'var(--chart-info)' },
  debug: { name: 'Debug', color: 'var(--chart-debug)' }
}

export function newPanel(type: PanelType = 'timeseries'): DashboardPanel {
  return {
    id: crypto.randomUUID(),
    title: '',
    type,
    w: type === 'stat' ? 3 : type === 'logs' ? 12 : 6,
    h: type === 'stat' ? 's' : 'm',
    source: type === 'logs' ? { kind: 'logs' } : { kind: 'volume', split: type === 'bars' ? 'channel' : 'level' }
  }
}

// Keeps the source valid when the panel type changes
export function fitSource(p: DashboardPanel, templates: TemplateRow[]): PanelSource {
  const s = p.source
  if (p.type === 'logs') return s.kind === 'logs' ? s : { kind: 'logs' }
  if (p.type === 'table' && s.kind !== 'table') {
    const t = templates[0]
    return { kind: 'table', templateId: t?.id ?? '', filters: [], metric: { fn: 'count' }, groupBy: t?.fields[0]?.position ?? null }
  }
  if (s.kind === 'logs') return { kind: 'volume', split: p.type === 'bars' ? 'channel' : 'level' }
  if (p.type === 'bars' && s.kind === 'volume' && s.split === 'none') return { ...s, split: 'channel' }
  if (p.type === 'bars' && s.kind === 'table' && s.groupBy === null) {
    const t = templates.find(x => x.id === s.templateId)
    return { ...s, groupBy: t?.fields[0]?.position ?? null }
  }
  return s
}

export function metricLabel(m: { fn: string, field?: number }, template?: TemplateRow) {
  const name = template?.fields.find(f => f.position === m.field)?.name ?? 'value'
  return {
    count: 'Count', sum: `Sum of ${name}`, avg: `Average ${name}`, min: `Lowest ${name}`, max: `Highest ${name}`, count_distinct: `Distinct ${name}`
  }[m.fn] ?? m.fn
}

export function autoTitle(p: DashboardPanel, templates: TemplateRow[]) {
  const s = p.source
  if (s.kind === 'logs') return s.level === 'error' ? 'Latest errors' : 'Latest messages'
  if (s.kind === 'volume') {
    const what = s.level ? `${LEVEL_SERIES[s.level]?.name ?? s.level} messages` : 'Messages'
    return s.split === 'none' ? what : `${what} by ${s.split}`
  }
  const t = templates.find(x => x.id === s.templateId)
  return `${metricLabel(s.metric, t)} · ${t?.name || 'table'}`
}
