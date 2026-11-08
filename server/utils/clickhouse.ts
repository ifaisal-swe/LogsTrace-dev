import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type ClickHouseClient } from '@clickhouse/client'

let client: ClickHouseClient | undefined

// All logs live here, so a missing URL is a configuration error, not "off"
export function useClickHouse() {
  if (!client) {
    const c = useRuntimeConfig()
    if (!c.clickhouseUrl) throw new Error('NUXT_CLICKHOUSE_URL is not set')
    client = createClient({
      url: c.clickhouseUrl,
      username: c.clickhouseUser,
      password: c.clickhousePassword,
      database: c.clickhouseDatabase,
      request_timeout: 30_000
    })
  }
  return client
}

// Applies server/db/clickhouse/*.sql in name order; every statement must be idempotent (IF NOT EXISTS)
export async function migrateClickHouse() {
  const ch = useClickHouse()
  const c = useRuntimeConfig()
  // The configured database may not exist yet, so create it through the always-present one
  const admin = createClient({ url: c.clickhouseUrl, username: c.clickhouseUser, password: c.clickhousePassword, database: 'default' })
  try {
    await admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${quoteIdent(c.clickhouseDatabase)}` })
  } finally {
    await admin.close()
  }
  const dir = resolve(process.cwd(), 'server/db/clickhouse')
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await ch.command({ query: readFileSync(resolve(dir, file), 'utf8') })
  }
}

function quoteIdent(name: string) {
  if (!/^\w+$/.test(name)) throw new Error('NUXT_CLICKHOUSE_DATABASE may only contain letters, digits and _')
  return `\`${name}\``
}

export type ChLogRow = {
  id: number
  projectId: string
  apiKeyId: string | null
  templateId: string | null
  ts: Date
  receivedAt: Date
  channel: string
  level: string
  text: string
  embed: unknown
  data: unknown
  traceId: string | null
  spanId: string | null
}

export function toClickHouseRow(r: ChLogRow) {
  return {
    id: r.id,
    project_id: r.projectId,
    api_key_id: r.apiKeyId,
    template_id: r.templateId,
    ts: chTime(r.ts),
    received_at: chTime(r.receivedAt),
    channel: r.channel,
    level: r.level,
    text: r.text,
    embed: r.embed ? JSON.stringify(r.embed) : '',
    data: JSON.stringify(r.data ?? {}),
    trace_id: r.traceId ?? '',
    span_id: r.spanId ?? ''
  }
}

// DateTime64 parses 'YYYY-MM-DD hh:mm:ss.sss' as UTC (the column's timezone)
const chTime = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '')

export async function chInsertLogEvents(rows: ChLogRow[]) {
  if (!rows.length) return
  const ch = useClickHouse()
  await ch.insert({
    table: 'log_events',
    values: rows.map(toClickHouseRow),
    format: 'JSONEachRow',
    // Server-side batching; waiting means rows are readable once this resolves
    clickhouse_settings: { async_insert: 1, wait_for_async_insert: 1 }
  })
}

export async function chDeleteLogEvents(filter: { projectIds: string[], before?: Date, templateId?: string, channel?: string, ids?: number[] }) {
  if (!filter.projectIds.length) return
  const ch = useClickHouse()
  const where = ['project_id IN {projects:Array(UUID)}']
  if (filter.before) where.push('ts < parseDateTime64BestEffort({before:String}, 3, \'UTC\')')
  if (filter.templateId) where.push('template_id = {template:UUID}')
  if (filter.channel !== undefined) where.push('channel = {channel:String}')
  if (filter.ids) where.push('id IN {ids:Array(UInt64)}')
  await ch.command({
    query: `DELETE FROM log_events WHERE ${where.join(' AND ')}`,
    query_params: { projects: filter.projectIds, before: filter.before?.toISOString(), template: filter.templateId, channel: filter.channel, ids: filter.ids }
  })
}
