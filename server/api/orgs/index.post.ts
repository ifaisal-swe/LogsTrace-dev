export default defineEventHandler(async (event) => {
  const user = requireVerifiedUser(event)
  await enforceRateLimit(event, `org-create:user:${user.id}`, 10, 3600)
  const { name } = await readValidated(event, orgSchema)
  const db = useDb()
  const slug = await uniqueSlug(name, 'org', async (s) => {
    const [row] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, s)).limit(1)
    return !!row
  })

  const org = await withSlugRetry(slug, s => db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.organizations).values({ name, slug: s }).returning()
    await tx.insert(schema.memberships).values({ orgId: created!.id, userId: user.id, role: 'owner' })
    return created!
  }))
  await audit(event, 'org.created', { orgId: org.id, meta: { slug: org.slug } })
  return org
})
