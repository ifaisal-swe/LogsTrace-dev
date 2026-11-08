export default defineEventHandler(async (event) => {
  const { user, ticket } = await requireOwnTicket(event)
  const { body } = await readValidated(event, ticketReplySchema)
  await enforceRateLimit(event, `ticket-reply:${user.id}`, 60, 3600)
  await addUserReply(event, ticket, user, body, 'web')
  return { ok: true }
})
