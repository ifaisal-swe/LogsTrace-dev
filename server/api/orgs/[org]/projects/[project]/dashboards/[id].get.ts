export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event, 'logs:read')
  const d = await loadDashboard(project.id, getUuidParam(event, 'id'))
  return { id: d.id, name: d.name, description: d.description, panels: d.panels, updatedAt: d.updatedAt }
})
