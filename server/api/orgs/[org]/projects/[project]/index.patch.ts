export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'projects:manage')
  const { name, retentionDays } = await readValidated(event, projectSettingsSchema)
  const set: Partial<typeof schema.projects.$inferInsert> = { name }
  if (retentionDays !== undefined) set.retentionDays = retentionDays
  // The address stays as created so existing links and API docs keep working
  const [updated] = await useDb().update(schema.projects).set(set).where(eq(schema.projects.id, project.id)).returning()
  await audit(event, 'project.updated', { orgId: org.id, meta: { projectId: project.id, name, retentionDays } })
  return updated
})
