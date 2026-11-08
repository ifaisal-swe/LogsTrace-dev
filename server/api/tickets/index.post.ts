export default defineEventHandler(async (event) => {
  const user = requireVerifiedUser(event)
  const body = await readValidated(event, ticketCreateSchema)
  await enforceRateLimit(event, `ticket-create:${user.id}`, 5, 3600)
  const ticket = await createTicket(event, { user, ...body, via: 'web' })
  return { id: ticket.id, number: ticket.number }
})
