export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  return useDb().select({
    id: schema.auditLog.id,
    action: schema.auditLog.action,
    ip: schema.auditLog.ip,
    createdAt: schema.auditLog.createdAt
  }).from(schema.auditLog)
    .where(and(eq(schema.auditLog.userId, user.id), sql`${schema.auditLog.action} like 'auth.%'`))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(50)
})
