export default defineEventHandler(async (event) => {
  const { org } = await requireOrgAccess(event, 'projects:create')
  const { name } = await readValidated(event, projectSchema)
  const db = useDb()
  const slug = await uniqueSlug(name, 'project', async (s) => {
    const [row] = await db.select({ id: schema.projects.id }).from(schema.projects)
      .where(and(eq(schema.projects.orgId, org.id), eq(schema.projects.slug, s))).limit(1)
    return !!row
  })

  const [project] = await withSlugRetry(slug, s => db.insert(schema.projects).values({ orgId: org.id, name, slug: s }).returning())
  // Every project starts with a dashboard; if this fails the Dashboards page makes it on first visit
  await createStarterDashboard(project!.id, event.context.user?.id ?? null)
    .catch(err => console.error('[dashboards] starter failed', err))
  await audit(event, 'project.created', { orgId: org.id, meta: { slug: project!.slug } })
  return project
})
