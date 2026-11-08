export default defineEventHandler(async (event) => {
  const { org } = await requireOrgAccess(event, 'members:read')
  return useDb().select({
    userId: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    role: schema.memberships.role,
    joinedAt: schema.memberships.createdAt
  }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, org.id))
    .orderBy(asc(schema.users.name))
})
