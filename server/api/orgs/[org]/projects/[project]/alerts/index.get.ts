export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event, 'projects:manage')
  const rows = await useDb().select().from(schema.alertRules)
    .where(eq(schema.alertRules.projectId, project.id)).orderBy(asc(schema.alertRules.name))
  return rows.map(publicRule)
})
