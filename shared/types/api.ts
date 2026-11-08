// Response shapes for API calls made with computed URLs, where Nuxt can't infer the route type

export type ProjectRow = { id: string, orgId: string, name: string, slug: string, retentionDays?: number | null, createdAt: string }

export type ProjectOverview = {
  project: ProjectRow
  stats?: { total: number, last24h: number, templates: number, last_event: string | null }
  channels: { channel: string, n: number }[]
}

export type ApiKeyRow = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  readSensitive: boolean
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  createdBy: string | null
}

export type FieldType = 'number' | 'id' | 'text'
export type TemplateFieldRow = { position: number, name: string, type: FieldType }

export type TemplateRow = {
  id: string
  channel: string
  pattern: string
  name: string | null
  description?: string | null
  tags?: string[]
  pinned?: boolean
  hidden?: boolean
  fields: TemplateFieldRow[]
  count: number
  firstSeenAt?: string
  lastSeenAt: string
  // Hourly counts for the last 24 hours (list endpoint only)
  spark?: number[]
}

export type SavedView = {
  id: string
  kind: 'table' | 'logs'
  templateId: string | null
  name: string
  query: Record<string, unknown>
  createdAt: string
  createdBy: string | null
}

export type ColumnProfile = {
  total: number
  empty: number
  distinct: number
  top: { value: string, n: number }[]
  numbers: { count: number, min: number | null, max: number | null, avg: number | null, p50: number | null, p95: number | null, histogram: { from: number, to: number, n: number }[] } | null
  masked: boolean
}

export type PanelType = 'timeseries' | 'bars' | 'stat' | 'table' | 'logs'
export type PanelSource =
  | { kind: 'table', templateId: string, filters: TableFilterRow[], metric: { fn: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct', field?: number }, groupBy: number | null }
  | { kind: 'volume', split: 'none' | 'level' | 'channel' | 'table', channel?: string, level?: LogLevel }
  | { kind: 'logs', q?: string, channel?: string, level?: LogLevel, template?: string }
export type TableFilterRow = { field: number, op: 'eq' | 'neq' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'empty' | 'not_empty', value: string, value2?: string }
export type DashboardPanel = { id: string, title: string, type: PanelType, w: 3 | 4 | 6 | 8 | 12, h: 's' | 'm' | 'l', source: PanelSource }
export type Dashboard = { id: string, name: string, description: string | null, panels: DashboardPanel[], updatedAt: string }
export type DashboardRow = { id: string, name: string, description: string | null, panelCount: number, updatedAt: string, createdBy: string | null }

// AI plans: the AI writes these steps, the server runs them (server/utils/aiPlan.ts)
export type PlanFilter = { column: number, op: TableFilterRow['op'], value: string, value2?: string, from?: { step: string, key: string } }
export type PlanStep =
  | { id: string, title: string, op: 'messages', text?: string, levels?: LogLevel[], channel?: string, table?: string, limit: number }
  | { id: string, title: string, op: 'find_value', value: string, limit: number }
  | { id: string, title: string, op: 'table_rows', table: string, filters: PlanFilter[], sort: { by: 'ts' | number, dir: 'asc' | 'desc' }, limit: number }
  | { id: string, title: string, op: 'table_summary', table: string, filters: PlanFilter[], groupBy: number[], bucket: 'minute' | 'hour' | 'day' | 'week' | 'month' | null, metrics: { fn: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct', column?: number }[], sort?: { by: string, dir: 'asc' | 'desc' }, limit: number }
export type AiPlan = { title: string, explanation: string, range: '15m' | '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | 'all', steps: PlanStep[] }
export type StepColumn = { key: string, label: string, type: 'time' | 'level' | 'number' | 'id' | 'text' }
export type StepResult = { id: string, title: string, op: PlanStep['op'], columns: StepColumn[], rows: (string | number | null)[][], total: number | null, note: string | null, tableId: string | null }
export type AiDashboardDraft = { name: string, description: string | null, panels: DashboardPanel[], notes: string | null }
