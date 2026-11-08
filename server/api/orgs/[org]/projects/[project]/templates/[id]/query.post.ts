const CSV_LIMIT = 10_000

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v)
  // Leading = + - @ would run as formulas in spreadsheet apps
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export default defineEventHandler(async (event) => {
  const { project, role } = await requireProjectAccess(event, 'logs:read')
  const template = await loadTemplate(project.id, getUuidParam(event, 'id'))
  const body = await readValidated(event, tableQuerySchema)
  const sensitive = roleCan(role, 'logs:read_sensitive')
  checkTableQuery(template, body)
  const csv = body.format === 'csv'
  const fileName = (template.name || 'table').replace(/[^\w-]+/g, '_')

  if (body.mode === 'rows') {
    const res = csv
      ? await runTableRows(template, sensitive, body, CSV_LIMIT, 0)
      : await runTableRows(template, sensitive, body)
    if (csv) {
      setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
      setResponseHeader(event, 'content-disposition', `attachment; filename="${fileName}.csv"`)
      const header = ['time', ...template.fields.map(f => f.name)]
      return [header, ...res.rows.map(r => [r.ts, ...r.values])].map(line => line.map(csvCell).join(',')).join('\r\n')
    }
    return { mode: 'rows' as const, total: res.total, rows: res.rows, hasMore: res.hasMore, masked: !sensitive }
  }

  const res = await runTableSummary(template, sensitive, body, csv ? CSV_LIMIT : 500)
  if (csv) {
    setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'content-disposition', `attachment; filename="${fileName}_summary.csv"`)
    const header = [...res.columns.groups, ...res.columns.metrics]
    return [header, ...res.rows.map(r => [...r.groups, ...r.metrics])].map(line => line.map(csvCell).join(',')).join('\r\n')
  }
  return { mode: 'summary' as const, columns: res.columns, rows: res.rows, truncated: res.truncated, masked: !sensitive }
})
