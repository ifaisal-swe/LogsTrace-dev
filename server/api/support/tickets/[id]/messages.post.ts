export default defineEventHandler(async (event) => {
  const { user, ticket } = await requireStaffTicket(event)
  const input = await readValidated(event, ticketStaffReplySchema)
  await enforceRateLimit(event, `ticket-staff-reply:${user.id}`, 300, 3600)
  await addStaffReply(event, ticket, user, input, 'web')
  return { ok: true }
})
