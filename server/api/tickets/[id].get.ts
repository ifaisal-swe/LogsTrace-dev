export default defineEventHandler(async (event) => {
  const { ticket: t } = await requireOwnTicket(event)
  await useDb().update(schema.tickets).set({ userReadAt: sql`now()` }).where(eq(schema.tickets.id, t.id))
  const [project] = t.projectId
    ? await useDb().select({ name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.id, t.projectId)).limit(1)
    : []
  return {
    ticket: {
      id: t.id, number: t.number, subject: t.subject, category: t.category, priority: t.priority, status: t.status,
      projectName: project?.name ?? null, createdAt: t.createdAt, lastMessageAt: t.lastMessageAt
    },
    // Staff names are shown; their email addresses are not
    messages: await ticketMessages(t.id, false),
    replyByEmail: inboundEnabled()
  }
})
