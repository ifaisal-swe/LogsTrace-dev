// Platform-wide numbers for the owner dashboard
export default defineEventHandler(async (event) => {
  requirePlatformOwner(event)
  const db = useDb()
  const u = schema.users
  const week = sql`now() - interval '7 days'`

  const [[users], [orgs], [projects], [keys], [sessions], [tickets], logs, recentUsers, recentEvents] = await Promise.all([
    db.select({
      total: sql<number>`count(*)::int`,
      verified: sql<number>`count(${u.emailVerifiedAt})::int`,
      lastWeek: sql<number>`count(*) filter (where ${u.createdAt} > ${week})::int`,
      disabled: sql<number>`count(${u.disabledAt})::int`,
      twoFactor: sql<number>`count(${u.totpEnabledAt})::int`
    }).from(u),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.organizations),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.projects),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.apiKeys).where(isNull(schema.apiKeys.revokedAt)),
    db.select({ total: sql<number>`count(distinct ${schema.sessions.userId})::int` }).from(schema.sessions).where(sql`${schema.sessions.lastSeenAt} > ${week}`),
    db.select({ open: sql<number>`count(*) filter (where ${schema.tickets.status} in ('open', 'waiting'))::int` }).from(schema.tickets),
    totalLogs().catch(() => null),
    db.select({ id: u.id, name: u.name, email: u.email, emailVerifiedAt: u.emailVerifiedAt, createdAt: u.createdAt })
      .from(u).orderBy(desc(u.createdAt)).limit(10),
    db.select({ id: schema.auditLog.id, action: schema.auditLog.action, createdAt: schema.auditLog.createdAt, email: u.email })
      .from(schema.auditLog).leftJoin(u, eq(u.id, schema.auditLog.userId))
      .orderBy(desc(schema.auditLog.createdAt)).limit(20)
  ])

  return {
    users, orgs: orgs!.total, projects: projects!.total, activeKeys: keys!.total,
    activeUsersWeek: sessions!.total, openTickets: tickets!.open, logs,
    recentUsers, recentEvents
  }
})
