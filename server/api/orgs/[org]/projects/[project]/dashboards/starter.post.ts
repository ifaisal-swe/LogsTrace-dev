import { count } from 'drizzle-orm'

// Builds the "Project overview" dashboard from the project's current tables
export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'templates:manage')
  const [row] = await useDb().select({ n: count() }).from(schema.dashboards).where(eq(schema.dashboards.projectId, project.id))
  if ((row?.n ?? 0) >= MAX_DASHBOARDS) throw createError({ statusCode: 400, statusMessage: `A project can keep up to ${MAX_DASHBOARDS} dashboards.` })
  const id = await createStarterDashboard(project.id, user.id)
  await audit(event, 'dashboard.created', { orgId: org.id, meta: { dashboardId: id, starter: true } })
  return { id }
})
