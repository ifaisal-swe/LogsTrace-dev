export default defineEventHandler(async (event) => {
  const { user, ticket } = await requireStaffTicket(event)
  const changes = await readValidated(event, ticketStaffUpdateSchema)
  const updated = await updateTicketAsStaff(event, ticket, user, changes)
  return { status: updated.status, priority: updated.priority, assigneeId: updated.assigneeId }
})
