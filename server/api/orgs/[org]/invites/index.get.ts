export default defineEventHandler(async (event) => {
  const { org } = await requireOrgAccess(event, 'members:manage')
  return useDb().select({
    id: schema.invitations.id,
    email: schema.invitations.email,
    role: schema.invitations.role,
    expiresAt: schema.invitations.expiresAt,
    createdAt: schema.invitations.createdAt
  }).from(schema.invitations)
    .where(and(eq(schema.invitations.orgId, org.id), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, new Date())))
    .orderBy(desc(schema.invitations.createdAt))
})
