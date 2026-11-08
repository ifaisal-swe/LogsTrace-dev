import { z } from 'zod'

// Deletes a table and every message in it. New matching messages start a fresh table.
export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'projects:manage')
  await enforceRateLimit(event, `purge:user:${user.id}`, 10, 3600)
  const template = await loadTemplate(project.id, getUuidParam(event, 'id'))
  const { confirm } = await readValidated(event, z.object({ confirm: z.string().max(80) }))
  if (confirm !== project.slug) throw createError({ statusCode: 400, statusMessage: 'Type the project address to confirm.' })

  // Messages first: if this fails the table is still there to retry from
  const removed = await deleteLogs([project.id], { templateId: template.id })
  await useDb().delete(schema.logTemplates).where(and(eq(schema.logTemplates.id, template.id), eq(schema.logTemplates.projectId, project.id)))
  forgetTemplate(project.id, template.id)
  await audit(event, 'template.deleted', { orgId: org.id, meta: { projectId: project.id, templateId: template.id, pattern: template.pattern, removed } })
  return { removed }
})
