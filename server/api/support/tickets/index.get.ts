export default defineEventHandler(async (event) => {
  const me = requireSupportStaff(event)
  const query = ticketListQuerySchema.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid query' })
  const { status, assigned, q } = query.data
  const t = schema.tickets
  const requester = schema.users

  const where = [
    status === 'active' ? inArray(t.status, ['open', 'waiting']) : status === 'all' ? undefined : eq(t.status, status),
    assigned === 'me' ? eq(t.assigneeId, me.id) : assigned === 'none' ? isNull(t.assigneeId) : undefined
  ]
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`
    const num = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null
    where.push(or(ilike(t.subject, like), ilike(requester.email, like), ilike(requester.name, like), num ? eq(t.number, num) : undefined))
  }

  const rows = await useDb().select({
    id: t.id, number: t.number, subject: t.subject, category: t.category, priority: t.priority, status: t.status,
    lastMessageAt: t.lastMessageAt, createdAt: t.createdAt, assigneeId: t.assigneeId,
    requesterName: requester.name, requesterEmail: requester.email,
    // Qualified by hand so they don't bind to the subquery's own columns if the join is ever dropped
    assigneeName: sql<string | null>`(select name from users a where a.id = tickets.assignee_id)`,
    unread: sql<boolean>`exists (select 1 from ticket_messages m where m.ticket_id = tickets.id and m.author = 'user' and m.created_at > coalesce(tickets.staff_read_at, 'epoch'))`
  }).from(t).innerJoin(requester, eq(requester.id, t.userId)).where(and(...where))
    // Urgent first, then oldest waiting
    .orderBy(sql`case ${t.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, desc(t.lastMessageAt))
    .limit(300)

  const counts = await useDb().select({ status: t.status, n: sql<number>`count(*)::int` }).from(t).groupBy(t.status)
  return { tickets: rows, counts: Object.fromEntries(counts.map(c => [c.status, c.n])) as Partial<Record<string, number>> }
})
