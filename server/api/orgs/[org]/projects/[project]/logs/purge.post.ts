import { z } from 'zod'

// Deletes messages older than a date, of one table and/or of one channel. Can't be undone, so it's admin-only and audited.
export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'projects:manage')
  await enforceRateLimit(event, `purge:user:${user.id}`, 10, 3600)
  const body = await readValidated(event, z.object({
    before: z.string().datetime({ offset: true }).optional(),
    templateId: z.string().uuid().optional(),
    channel: z.string().trim().max(100).optional(),
    confirm: z.string().max(80)
  }).refine(b => b.before || b.templateId || b.channel !== undefined, 'Choose a date, a table or a channel.'))
  if (body.confirm !== project.slug) throw createError({ statusCode: 400, statusMessage: 'Type the project address to confirm.' })
  if (body.templateId) await loadTemplate(project.id, body.templateId)

  const removed = await deleteLogs([project.id], { before: body.before ? new Date(body.before) : undefined, templateId: body.templateId, channel: body.channel })
  await audit(event, 'logs.purged', { orgId: org.id, meta: { projectId: project.id, before: body.before, templateId: body.templateId, channel: body.channel, removed } })
  // One delete covers every match, so there is never more left to remove
  return { removed, more: false }
})
