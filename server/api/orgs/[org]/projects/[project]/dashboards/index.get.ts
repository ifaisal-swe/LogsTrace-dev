export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event, 'logs:read')
  const d = schema.dashboards
  const rows = await useDb().select({
    id: d.id, name: d.name, description: d.description, panels: d.panels, updatedAt: d.updatedAt, createdBy: schema.users.name
  }).from(d).leftJoin(schema.users, eq(schema.users.id, d.createdBy))
    .where(eq(d.projectId, project.id)).orderBy(asc(d.name))
  return rows.map(({ panels, ...r }) => ({ ...r, panelCount: panels.length }))
})
