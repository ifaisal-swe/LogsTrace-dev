import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgAccess(event, 'org:delete')
  const { confirm } = await readValidated(event, z.object({ confirm: z.string() }))
  if (confirm !== org.slug) {
    throw createError({ statusCode: 400, statusMessage: `Type ${org.slug} to confirm.`, data: { field: 'confirm' } })
  }
  const projects = await useDb().select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.orgId, org.id))
  // Logs first: ClickHouse has no foreign-key cascade, and a failure here leaves the org for a retry
  await deleteLogs(projects.map(p => p.id))
  await useDb().delete(schema.organizations).where(eq(schema.organizations.id, org.id))
  await audit(event, 'org.deleted', { meta: { orgId: org.id, slug: org.slug } })
  return { ok: true }
})
