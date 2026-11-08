const OP_WORDS: Record<PlanFilter['op'], string> = {
  eq: 'is', neq: 'is not', contains: 'contains', not_contains: 'does not contain', gt: '>', gte: '≥', lt: '<', lte: '≤',
  between: 'is between', in: 'is one of', empty: 'is empty', not_empty: 'is not empty'
}
const FN_WORDS = { count: 'count', sum: 'sum of', avg: 'average', min: 'lowest', max: 'highest', count_distinct: 'distinct' } as const

export const PLAN_RANGE_LABEL: Record<AiPlan['range'], string> = {
  '15m': 'last 15 minutes', '1h': 'last hour', '6h': 'last 6 hours', '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', 'all': 'all time'
}

const tableName = (t?: TemplateRow) => (t ? t.name || t.pattern.replace(/<\*>/g, '…').slice(0, 50) : 'a table')
const colName = (t: TemplateRow | undefined, pos: number) => t?.fields.find(f => f.position === pos)?.name ?? `column ${pos}`

// Label of a step's output column, e.g. "c4" → "player" or "m0" → "metric 1"
function outputLabel(step: PlanStep | undefined, key: string, templates: TemplateRow[]) {
  if (!step) return key
  const t = 'table' in step ? templates.find(x => x.id === step.table) : undefined
  if (/^c\d+$/.test(key)) return colName(t, Number(key.slice(1)))
  if (step.op === 'table_summary' && /^g\d$/.test(key)) {
    const i = Number(key.slice(1)) - (step.bucket ? 1 : 0)
    return i < 0 ? step.bucket! : colName(t, step.groupBy[i] ?? -1)
  }
  if (/^m\d$/.test(key)) return 'result'
  return key
}

function filterText(f: PlanFilter, t: TemplateRow | undefined, steps: PlanStep[], templates: TemplateRow[]) {
  const name = colName(t, f.column)
  if (f.from) {
    const n = steps.findIndex(s => s.id === f.from!.step) + 1
    return `${name} is one of the ${outputLabel(steps[n - 1], f.from.key, templates)} values from step ${n}`
  }
  if (f.op === 'empty' || f.op === 'not_empty') return `${name} ${OP_WORDS[f.op]}`
  if (f.op === 'between') return `${name} is between ${f.value} and ${f.value2}`
  return `${name} ${OP_WORDS[f.op]} “${f.value}”`
}

export function describeStep(step: PlanStep, steps: PlanStep[], templates: TemplateRow[]) {
  if (step.op === 'find_value') return `Find every message where a word equals “${step.value}”, in all tables.`
  if (step.op === 'messages') {
    const parts = [`Latest ${step.limit} messages`]
    if (step.levels?.length) parts.push(`at level ${step.levels.join(' or ')}`)
    if (step.channel) parts.push(`in channel “${step.channel}”`)
    if (step.table) parts.push(`from ${tableName(templates.find(x => x.id === step.table))}`)
    if (step.text) parts.push(`containing “${step.text}”`)
    return `${parts.join(' ')}.`
  }
  const t = templates.find(x => x.id === step.table)
  const where = step.filters.length ? ` where ${step.filters.map(f => filterText(f, t, steps, templates)).join(' and ')}` : ''
  if (step.op === 'table_rows') {
    const sort = step.sort.by === 'ts' ? (step.sort.dir === 'desc' ? 'newest first' : 'oldest first') : `by ${colName(t, step.sort.by)} ${step.sort.dir === 'desc' ? 'high to low' : 'low to high'}`
    return `Rows of ${tableName(t)}${where}, ${sort} (up to ${step.limit}).`
  }
  const metrics = step.metrics.map(m => (m.fn === 'count' ? 'count' : `${FN_WORDS[m.fn]} ${colName(t, m.column ?? -1)}`)).join(', ')
  const by = [...(step.bucket ? [`per ${step.bucket}`] : []), ...step.groupBy.map(g => `by ${colName(t, g)}`)].join(', ')
  return `${metrics[0]!.toUpperCase()}${metrics.slice(1)} in ${tableName(t)}${by ? ` ${by}` : ''}${where}.`
}
