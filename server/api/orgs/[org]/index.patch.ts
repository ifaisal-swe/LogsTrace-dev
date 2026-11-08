export default defineEventHandler(async (event) => {
  const { org } = await requireOrgAccess(event, 'org:update')
  const { name } = await readValidated(event, orgSchema)
  // The address stays as created so existing links keep working
  const [updated] = await useDb().update(schema.organizations).set({ name }).where(eq(schema.organizations.id, org.id)).returning()
  await audit(event, 'org.updated', { orgId: org.id, meta: { name } })
  return updated
})
