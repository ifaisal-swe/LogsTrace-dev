export default defineEventHandler(async (event) => {
  const { org } = await requireOrgAccess(event, 'members:manage')
  const id = getUuidParam(event, 'id')
  const deleted = await useDb().delete(schema.invitations)
    .where(and(eq(schema.invitations.id, id), eq(schema.invitations.orgId, org.id), isNull(schema.invitations.acceptedAt)))
    .returning({ email: schema.invitations.email })
  if (!deleted.length) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  await audit(event, 'invite.revoked', { orgId: org.id, meta: { email: deleted[0]!.email } })
  return { ok: true }
})
