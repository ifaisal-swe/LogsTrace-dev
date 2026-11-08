// Background jobs: volume alerts every minute, retention cleanup and ticket auto-close every hour.
// Each run takes a Postgres advisory lock so only one app instance does the work.
const ALERT_LOCK = 734_001
const RETENTION_LOCK = 734_002
const TICKETS_LOCK = 734_003

async function withLock(id: number, fn: () => Promise<void>) {
  const client = useDbClient()
  await client.begin(async (tx) => {
    const [row] = await tx<{ ok: boolean }[]>`select pg_try_advisory_xact_lock(${id}) as ok`
    if (row?.ok) await fn()
  })
}

export async function purgeExpiredLogs() {
  const db = useDb()
  const projects = await db.select({ id: schema.projects.id, orgId: schema.projects.orgId, days: schema.projects.retentionDays })
    .from(schema.projects).where(sql`${schema.projects.retentionDays} is not null`)
  for (const p of projects) {
    const removed = await deleteLogs([p.id], { before: new Date(Date.now() - p.days! * 86400_000) })
    if (removed) await audit(null, 'retention.purged', { orgId: p.orgId, meta: { projectId: p.id, removed, days: p.days } })
  }
}

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const alertTimer = setInterval(() => {
    withLock(ALERT_LOCK, checkVolumeAlerts).catch(err => console.error('[jobs] volume alerts failed', err))
  }, 60_000)
  const retentionTimer = setInterval(() => {
    withLock(RETENTION_LOCK, purgeExpiredLogs).catch(err => console.error('[jobs] retention failed', err))
    withLock(TICKETS_LOCK, closeStaleTickets).catch(err => console.error('[jobs] ticket auto-close failed', err))
  }, 3_600_000)
  // First retention pass shortly after start, not an hour later
  const first = setTimeout(() => withLock(RETENTION_LOCK, purgeExpiredLogs).catch(err => console.error('[jobs] retention failed', err)), 60_000)
  alertTimer.unref?.()
  retentionTimer.unref?.()
  first.unref?.()
})
