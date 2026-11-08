import { count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'templates:manage')
  const body = await readValidated(event, dashboardSchema)
  await requirePanelTemplates(project.id, body.panels)

  const db = useDb()
  const [row] = await db.select({ n: count() }).from(schema.dashboards).where(eq(schema.dashboards.projectId, project.id))
  if ((row?.n ?? 0) >= MAX_DASHBOARDS) throw createError({ statusCode: 400, statusMessage: `A project can keep up to ${MAX_DASHBOARDS} dashboards.` })

  const [dashboard] = await db.insert(schema.dashboards).values({
    projectId: project.id, name: body.name, description: body.description || null, panels: body.panels, createdBy: user.id
  }).returning({ id: schema.dashboards.id })
  await audit(event, 'dashboard.created', { orgId: org.id, meta: { dashboardId: dashboard!.id, name: body.name } })
  return dashboard
})
