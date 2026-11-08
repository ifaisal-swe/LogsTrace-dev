export async function countOwners(orgId: string) {
  const [row] = await useDb().select({ n: sql<number>`count(*)::int` }).from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.role, 'owner')))
  return row?.n ?? 0
}
