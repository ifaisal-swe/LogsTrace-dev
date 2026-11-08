export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event, 'keys:manage')
  return useDb().select({
    id: schema.apiKeys.id,
    name: schema.apiKeys.name,
    prefix: schema.apiKeys.prefix,
    scopes: schema.apiKeys.scopes,
    readSensitive: schema.apiKeys.readSensitive,
    lastUsedAt: schema.apiKeys.lastUsedAt,
    revokedAt: schema.apiKeys.revokedAt,
    createdAt: schema.apiKeys.createdAt,
    createdBy: schema.users.name
  }).from(schema.apiKeys)
    .leftJoin(schema.users, eq(schema.users.id, schema.apiKeys.createdBy))
    .where(eq(schema.apiKeys.projectId, project.id))
    .orderBy(desc(schema.apiKeys.createdAt))
})
