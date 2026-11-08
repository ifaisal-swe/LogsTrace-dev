export default defineEventHandler(async (event) => {
  const { org, project, user, role } = await requireProjectAccess(event, 'keys:manage')
  const { name, access, readSensitive } = await readValidated(event, apiKeySchema)
  const scopes = access === 'both' ? ['ingest', 'read'] : access === 'read' ? ['read'] : ['ingest']
  // A key can't see more than the person who made it
  const sensitive = scopes.includes('read') && readSensitive && roleCan(role, 'logs:read_sensitive')
  const key = `lgk_${randomToken(32)}`
  const [row] = await useDb().insert(schema.apiKeys).values({
    projectId: project.id, name, prefix: key.slice(0, 12), keyHash: sha256(key), createdBy: user.id, scopes, readSensitive: sensitive
  }).returning({ id: schema.apiKeys.id })
  await audit(event, 'apikey.created', { orgId: org.id, meta: { projectId: project.id, keyId: row!.id, name, scopes, readSensitive: sensitive } })
  // The full key is returned exactly once
  return { id: row!.id, key }
})
