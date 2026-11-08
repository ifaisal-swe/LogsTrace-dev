// Copies Postgres log_events into ClickHouse and compares counts per project: npm run ch:backfill
// Safe to rerun: rows keep their Postgres ids and the table collapses duplicates.
import postgres from 'postgres'
import { createClient } from '@clickhouse/client'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const env = process.env
if (!env.NUXT_DATABASE_URL || !env.NUXT_CLICKHOUSE_URL) {
  console.error('Set NUXT_DATABASE_URL and NUXT_CLICKHOUSE_URL (plus NUXT_CLICKHOUSE_USER / _PASSWORD / _DATABASE).')
  process.exit(1)
}
const database = env.NUXT_CLICKHOUSE_DATABASE || 'logstrace'
if (!/^\w+$/.test(database)) {
  console.error('NUXT_CLICKHOUSE_DATABASE may only contain letters, digits and _')
  process.exit(1)
}
const auth = { url: env.NUXT_CLICKHOUSE_URL, username: env.NUXT_CLICKHOUSE_USER || 'default', password: env.NUXT_CLICKHOUSE_PASSWORD || '' }
const BATCH = 5000

const sql = postgres(env.NUXT_DATABASE_URL, { max: 2 })
const admin = createClient({ ...auth, database: 'default' })
// Progress headers keep long OPTIMIZE/insert requests alive behind proxies that drop idle connections
const ch = createClient({ ...auth, database, request_timeout: 120_000, clickhouse_settings: { send_progress_in_http_headers: 1, http_headers_progress_interval_ms: '10000' } })
const chTime = d => d.toISOString().replace('T', ' ').replace('Z', '')

try {
  await admin.command({ query: `CREATE DATABASE IF NOT EXISTS \`${database}\`` })
  const dir = resolve('server/db/clickhouse')
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await ch.command({ query: readFileSync(resolve(dir, file), 'utf8') })
  }

  let lastId = 0
  let copied = 0
  for (;;) {
    const rows = await sql`
      select id, project_id, api_key_id, template_id, ts, received_at, channel, level, text, embed, data, trace_id, span_id
      from log_events where id > ${lastId} order by id limit ${BATCH}`
    if (!rows.length) break
    await ch.insert({
      table: 'log_events',
      format: 'JSONEachRow',
      values: rows.map(r => ({
        id: Number(r.id),
        project_id: r.project_id,
        api_key_id: r.api_key_id,
        template_id: r.template_id,
        ts: chTime(r.ts),
        received_at: chTime(r.received_at),
        channel: r.channel,
        level: r.level,
        text: r.text,
        embed: r.embed ? JSON.stringify(r.embed) : '',
        data: JSON.stringify(r.data ?? {}),
        trace_id: r.trace_id ?? '',
        span_id: r.span_id ?? ''
      }))
    })
    lastId = Number(rows.at(-1).id)
    copied += rows.length
    if (process.stdout.isTTY) process.stdout.write(`\rcopied ${copied} rows`)
  }
  console.log(`\rcopied ${copied} rows`)

  // Merge away duplicates from earlier runs or overlap with live mirroring, then compare
  await ch.command({ query: 'OPTIMIZE TABLE log_events FINAL' })
  const pg = await sql`select project_id, count(*)::int as n from log_events group by project_id`
  const chRows = await (await ch.query({ query: 'SELECT toString(project_id) AS project_id, toUInt32(count()) AS n FROM log_events FINAL GROUP BY project_id', format: 'JSONEachRow' })).json()
  const chCounts = new Map(chRows.map(r => [r.project_id, Number(r.n)]))
  let mismatches = 0
  for (const p of pg) {
    const c = chCounts.get(p.project_id) ?? 0
    // ClickHouse may hold a few newer rows mirrored by live ingest after the copy started
    if (c < p.n) {
      mismatches++
      console.log(`project ${p.project_id}: postgres ${p.n}, clickhouse ${c}`)
    }
  }
  console.log(mismatches ? `${mismatches} project(s) behind; rerun to catch up.` : `All ${pg.length} project(s) match.`)
  process.exitCode = mismatches ? 1 : 0
} catch (err) {
  console.error('Backfill failed:', err.message ?? err)
  process.exitCode = 1
} finally {
  await sql.end()
  await admin.close()
  await ch.close()
}
