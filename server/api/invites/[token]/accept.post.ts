export default defineEventHandler(async (event) => {
  const user = requireVerifiedUser(event)
  await enforceRateLimit(event, `invite-accept:user:${user.id}`, 20, 3600)
  const invite = await findOpenInvite(getRouterParam(event, 'token') ?? '')
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'This invitation has expired or was already used.' })
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: `This invitation is for ${invite.email}. Sign in with that account to accept it.` })
  }

  const db = useDb()
  await db.transaction(async (tx) => {
    const [claimed] = await tx.update(schema.invitations).set({ acceptedAt: new Date() })
      .where(and(eq(schema.invitations.id, invite.id), isNull(schema.invitations.acceptedAt)))
      .returning({ id: schema.invitations.id })
    if (!claimed) throw createError({ statusCode: 409, statusMessage: 'This invitation was already used.' })
    await tx.insert(schema.memberships).values({ orgId: invite.orgId, userId: user.id, role: invite.role })
      .onConflictDoNothing()
  })
  await audit(event, 'invite.accepted', { orgId: invite.orgId, meta: { role: invite.role } })
  return { ok: true, orgSlug: invite.orgSlug }
})
