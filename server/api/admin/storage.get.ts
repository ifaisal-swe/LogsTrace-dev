// Owner check that every log is in ClickHouse: compares it with the old Postgres copy (#82) and the id sequence
export default defineEventHandler(async (event) => {
  const user = requirePlatformOwner(event)
  // Full scans on both stores
  await enforceRateLimit(event, `storage-check:user:${user.id}`, 10, 600)
  const pg = useDbClient()
  const c = useRuntimeConfig()

  const clickhouse = await (async () => {
    try {
      const [info] = await chRows<{ version: string, rows: number, maxId: number | null, oldest: string | null, newest: string | null }>(ch`
        SELECT version() AS version, uniqExact(id) AS rows, if(count() = 0, NULL, max(id)) AS maxId,
          if(count() = 0, NULL, min(ts)) AS oldest, if(count() = 0, NULL, max(ts)) AS newest FROM log_events`)
      const [disk] = await chRows<{ bytes: number, parts: number }>(ch`
        SELECT sum(bytes_on_disk) AS bytes, count() AS parts FROM system.parts
        WHERE database = currentDatabase() AND table = 'log_events' AND active`)
      const perProject = await chRows<{ id: string, rows: number }>(ch`
        SELECT toString(project_id) AS id, uniqExact(id) AS rows FROM log_events GROUP BY project_id`)
      return { ok: true as const, database: c.clickhouseDatabase, ...info!, bytes: Number(disk?.bytes ?? 0), parts: Number(disk?.parts ?? 0), perProject }
    } catch (err) {
      console.error('[storage-check] ClickHouse', err)
      return { ok: false as const, database: c.clickhouseDatabase }
    }
  })()

  const [seq] = await pg<{ lastValue: string, isCalled: boolean }[]>`select last_value as "lastValue", is_called as "isCalled" from log_event_ids`
  const [legacyExists] = await pg<{ exists: boolean }[]>`select to_regclass('public.log_events') is not null as exists`
  const legacy = legacyExists?.exists
    ? await pg<{ id: string, rows: number, maxId: string }[]>`
        select project_id::text as id, count(*)::int as rows, max(id)::text as "maxId" from log_events group by project_id`
    : null

  const names = await useDb().select({ id: schema.projects.id, name: schema.projects.name, org: schema.organizations.name })
    .from(schema.projects).innerJoin(schema.organizations, eq(schema.organizations.id, schema.projects.orgId))
  const chByProject = new Map((clickhouse.ok ? clickhouse.perProject : []).map(r => [r.id, Number(r.rows)]))
  const pgByProject = new Map((legacy ?? []).map(r => [r.id, Number(r.rows)]))
  const projects = names.map(p => ({
    ...p,
    clickhouse: chByProject.get(p.id) ?? 0,
    postgres: legacy ? (pgByProject.get(p.id) ?? 0) : null
  })).filter(p => p.clickhouse || p.postgres).sort((a, b) => b.clickhouse - a.clickhouse)

  const legacyRows = legacy ? legacy.reduce((n, r) => n + Number(r.rows), 0) : null
  const legacyMaxId = legacy?.length ? Math.max(...legacy.map(r => Number(r.maxId))) : null
  // A project is short when ClickHouse holds fewer rows than the old copy (retention can explain it)
  const missing = projects.filter(p => p.postgres != null && p.clickhouse < p.postgres)

  return {
    clickhouse: clickhouse.ok ? { ...clickhouse, perProject: undefined } : clickhouse,
    sequenceLastId: seq?.isCalled ? Number(seq.lastValue) : 0,
    legacy: legacy ? { rows: legacyRows, maxId: legacyMaxId } : null,
    projects,
    allInClickHouse: clickhouse.ok && missing.length === 0,
    checkedAt: new Date().toISOString()
  }
})
