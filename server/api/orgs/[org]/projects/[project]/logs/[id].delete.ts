import { z } from 'zod'

// Deletes one message (e.g. something logged by mistake). Admin-only and audited, like the bulk delete.
export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'projects:manage')
  await enforceRateLimit(event, `log-delete:user:${user.id}`, 120, 3600)
  const parsed = z.coerce.number().int().positive().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid message id' })

  const removed = await deleteLogs([project.id], { ids: [parsed.data] })
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  await audit(event, 'logs.deleted', { orgId: org.id, meta: { projectId: project.id, id: parsed.data } })
  return { removed }
})
