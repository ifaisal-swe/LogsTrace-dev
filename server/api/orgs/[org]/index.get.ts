export default defineEventHandler(async (event) => {
  const { org, role } = await requireOrgAccess(event, 'logs:read')
  const projects = await useDb().select().from(schema.projects).where(eq(schema.projects.orgId, org.id)).orderBy(asc(schema.projects.name))
  const permissions = PERMISSIONS.filter(p => roleCan(role, p))
  return { org, role, permissions, projects }
})
