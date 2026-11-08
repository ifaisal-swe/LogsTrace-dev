export default defineEventHandler(async (event) => {
  const user = requireVerifiedUser(event)
  const t = schema.tickets
  return useDb().select({
    id: t.id, number: t.number, subject: t.subject, category: t.category, priority: t.priority, status: t.status,
    lastMessageAt: t.lastMessageAt, createdAt: t.createdAt,
    // Unread = a public staff message newer than the requester's last visit.
    // Qualified by hand: without a join Drizzle renders ${t.id} as bare "id", which binds to m.id here.
    unread: sql<boolean>`exists (select 1 from ticket_messages m where m.ticket_id = tickets.id and m.author = 'staff' and not m.internal and m.created_at > coalesce(tickets.user_read_at, 'epoch'))`
  }).from(t).where(eq(t.userId, user.id)).orderBy(desc(t.lastMessageAt)).limit(200)
})
