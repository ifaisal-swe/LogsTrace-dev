export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'templates:manage')
  const id = getUuidParam(event, 'id')
  const d = await loadDashboard(project.id, id)
  await useDb().delete(schema.dashboards).where(eq(schema.dashboards.id, id))
  await audit(event, 'dashboard.deleted', { orgId: org.id, meta: { dashboardId: id, name: d.name } })
  return { ok: true }
})
