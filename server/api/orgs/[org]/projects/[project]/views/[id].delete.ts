export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'templates:manage')
  const id = getUuidParam(event, 'id')
  const [view] = await useDb().delete(schema.savedViews)
    .where(and(eq(schema.savedViews.id, id), eq(schema.savedViews.projectId, project.id)))
    .returning({ id: schema.savedViews.id, name: schema.savedViews.name })
  if (!view) throw createError({ statusCode: 404, statusMessage: 'View not found' })
  await audit(event, 'view.deleted', { orgId: org.id, meta: { viewId: view.id, name: view.name } })
  return { ok: true }
})
