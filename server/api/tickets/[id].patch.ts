export default defineEventHandler(async (event) => {
  const { user, ticket } = await requireOwnTicket(event)
  const { status } = await readValidated(event, ticketUserUpdateSchema)
  const updated = await setStatusAsUser(event, ticket, user, status)
  return { status: updated.status }
})
