import { randomUUID } from 'node:crypto'
import type { z } from 'zod'

type Panel = z.infer<typeof panelSchema>

// A first dashboard with the numbers most projects care about, plus trends for the
// number columns of the busiest tables. Works for any project; panels adapt to its tables.
export async function starterPanels(projectId: string): Promise<Panel[]> {
  const id = () => randomUUID()
  const panels: Panel[] = [
    { id: id(), title: 'Messages', type: 'stat', w: 4, h: 's', source: { kind: 'volume', split: 'none' } },
    { id: id(), title: 'Errors', type: 'stat', w: 4, h: 's', source: { kind: 'volume', split: 'none', level: 'error' } },
    { id: id(), title: 'Warnings', type: 'stat', w: 4, h: 's', source: { kind: 'volume', split: 'none', level: 'warn' } },
    { id: id(), title: 'Messages by level', type: 'timeseries', w: 8, h: 'm', source: { kind: 'volume', split: 'level' } },
    { id: id(), title: 'Busiest tables', type: 'bars', w: 4, h: 'm', source: { kind: 'volume', split: 'table' } },
    { id: id(), title: 'Messages by channel', type: 'timeseries', w: 6, h: 'm', source: { kind: 'volume', split: 'channel' } },
    { id: id(), title: 'Channels', type: 'bars', w: 6, h: 'm', source: { kind: 'volume', split: 'channel' } }
  ]

  const t = schema.logTemplates
  const tables = await useDb().select({ id: t.id, name: t.name, pattern: t.pattern, fields: t.fields }).from(t)
    .where(and(eq(t.projectId, projectId), eq(t.hidden, false))).orderBy(desc(t.count)).limit(10)
  let added = 0
  for (const table of tables) {
    const field = table.fields.find(f => f.type === 'number')
    if (!field) continue
    // Names come from log data or users; fall back rather than echo anything link-like
    const tableLabel = table.name || `${table.pattern.replace(/<\*>/g, '…').slice(0, 40).trim()}`
    const title = `Average ${field.name} · ${tableLabel}`.slice(0, 80)
    panels.push({
      id: id(),
      title: isSafeDisplayText(title) ? title : 'Average value',
      type: 'timeseries',
      w: 6,
      h: 'm',
      source: { kind: 'table', templateId: table.id, filters: [], metric: { fn: 'avg', field: field.position }, groupBy: null }
    })
    if (++added === 4) break
  }

  panels.push({ id: id(), title: 'Latest errors', type: 'logs', w: 12, h: 'm', source: { kind: 'logs', level: 'error' } })
  return panels
}

export async function createStarterDashboard(projectId: string, userId: string | null) {
  const panels = await starterPanels(projectId)
  const [row] = await useDb().insert(schema.dashboards).values({
    projectId, name: 'Project overview', description: 'Key numbers for this project. Edit or add panels any time.', panels, createdBy: userId
  }).returning({ id: schema.dashboards.id })
  return row!.id
}
