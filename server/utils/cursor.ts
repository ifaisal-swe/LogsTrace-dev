// Logs are ordered by their own timestamp (senders batch and retry, so arrival order differs).
// The cursor is "<iso ts>_<id>" of the last row on the page; id breaks ties between equal timestamps.
export function encodeCursor(row: { ts: Date, id: number }) {
  return `${row.ts.toISOString()}_${row.id}`
}

export function parseCursor(cursor: string | undefined) {
  if (!cursor) return undefined
  const m = /^(.+)_(\d+)$/.exec(cursor)
  const date = m ? new Date(m[1]!) : null
  if (!m || !date || Number.isNaN(date.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
  return { ts: date, id: Number(m[2]) }
}
