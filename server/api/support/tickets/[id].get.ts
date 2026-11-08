export default defineEventHandler(async (event) => {
  const { ticket: t } = await requireStaffTicket(event)
  const db = useDb()
  await db.update(schema.tickets).set({ staffReadAt: sql`now()` }).where(eq(schema.tickets.id, t.id))
  const [requester] = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, createdAt: schema.users.createdAt, emailVerifiedAt: schema.users.emailVerifiedAt })
    .from(schema.users).where(eq(schema.users.id, t.userId)).limit(1)
  const [project] = t.projectId
    ? await db.select({ name: schema.projects.name, slug: schema.projects.slug, orgName: schema.organizations.name, orgSlug: schema.organizations.slug })
        .from(schema.projects).innerJoin(schema.organizations, eq(schema.organizations.id, schema.projects.orgId))
        .where(eq(schema.projects.id, t.projectId)).limit(1)
    : []
  const otherTickets = await db.select({ id: schema.tickets.id, number: schema.tickets.number, subject: schema.tickets.subject, status: schema.tickets.status })
    .from(schema.tickets).where(and(eq(schema.tickets.userId, t.userId), sql`${schema.tickets.id} <> ${t.id}`))
    .orderBy(desc(schema.tickets.lastMessageAt)).limit(10)
  return {
    ticket: {
      id: t.id, number: t.number, subject: t.subject, category: t.category, priority: t.priority, status: t.status,
      assigneeId: t.assigneeId, createdAt: t.createdAt, lastMessageAt: t.lastMessageAt
    },
    requester: requester ?? null,
    project: project ?? null,
    otherTickets,
    messages: await ticketMessages(t.id, true),
    replyByEmail: inboundEnabled()
  }
})
