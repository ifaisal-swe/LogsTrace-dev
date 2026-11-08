export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'keys:manage')
  const id = getUuidParam(event, 'id')
  const [row] = await useDb().update(schema.apiKeys).set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.projectId, project.id), isNull(schema.apiKeys.revokedAt)))
    .returning({ id: schema.apiKeys.id })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Key not found or already revoked' })
  forgetApiKeys()
  await audit(event, 'apikey.revoked', { orgId: org.id, meta: { projectId: project.id, keyId: id } })
  return { ok: true }
})
