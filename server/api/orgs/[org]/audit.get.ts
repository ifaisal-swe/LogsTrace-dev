export default defineEventHandler(async (event) => {
  const { org } = await requireOrgAccess(event, 'audit:read')
  return useDb().select({
    id: schema.auditLog.id,
    action: schema.auditLog.action,
    ip: schema.auditLog.ip,
    meta: schema.auditLog.meta,
    createdAt: schema.auditLog.createdAt,
    userName: schema.users.name,
    userEmail: schema.users.email
  }).from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(eq(schema.auditLog.orgId, org.id))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(200)
})
