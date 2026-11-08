export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'templates:manage')
  const id = getUuidParam(event, 'id')
  await loadDashboard(project.id, id)
  const body = await readValidated(event, dashboardPatchSchema)
  if (body.panels) await requirePanelTemplates(project.id, body.panels)

  const set: Partial<typeof schema.dashboards.$inferInsert> = { updatedAt: new Date() }
  if (body.name !== undefined) set.name = body.name
  if (body.description !== undefined) set.description = body.description || null
  if (body.panels !== undefined) set.panels = body.panels
  await useDb().update(schema.dashboards).set(set).where(eq(schema.dashboards.id, id))
  await audit(event, 'dashboard.updated', { orgId: org.id, meta: { dashboardId: id, panels: body.panels?.length } })
  return { ok: true }
})
