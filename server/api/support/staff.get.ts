export default defineEventHandler(async (event) => {
  requireSupportStaff(event)
  return useDb().select({ id: schema.users.id, name: schema.users.name, platformRole: schema.users.platformRole }).from(schema.users)
    .where(and(inArray(schema.users.platformRole, ['admin', 'moderator']), isNull(schema.users.disabledAt)))
    .orderBy(asc(schema.users.name)).limit(100)
})
