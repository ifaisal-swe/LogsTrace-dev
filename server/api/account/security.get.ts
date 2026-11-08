export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const [row] = await useDb().select({ totpEnabledAt: schema.users.totpEnabledAt, loginAlerts: schema.users.loginAlerts })
    .from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  const [left] = await useDb().select({ n: sql<number>`count(*)::int` }).from(schema.recoveryCodes)
    .where(and(eq(schema.recoveryCodes.userId, user.id), isNull(schema.recoveryCodes.usedAt)))
  return { totpEnabledAt: row?.totpEnabledAt ?? null, recoveryCodesLeft: left?.n ?? 0, loginAlerts: row?.loginAlerts ?? true }
})
