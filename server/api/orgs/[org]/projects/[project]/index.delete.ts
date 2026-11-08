import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'projects:manage')
  const { confirm } = await readValidated(event, z.object({ confirm: z.string() }))
  if (confirm !== project.slug) throw createError({ statusCode: 400, statusMessage: `Type ${project.slug} to confirm.`, data: { field: 'confirm' } })
  // Logs first: ClickHouse has no foreign-key cascade, and a failure here leaves the project for a retry
  await deleteLogs([project.id])
  await useDb().delete(schema.projects).where(eq(schema.projects.id, project.id))
  await audit(event, 'project.deleted', { orgId: org.id, meta: { projectId: project.id, slug: project.slug } })
  return { ok: true }
})
