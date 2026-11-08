export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) return { user: null, orgs: [] }

  const orgs = await useDb().select({
    id: schema.organizations.id,
    name: schema.organizations.name,
    slug: schema.organizations.slug,
    role: schema.memberships.role
  })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(asc(schema.organizations.name))

  return { user, orgs, requireEmailVerification: !!useRuntimeConfig().requireEmailVerification }
})
