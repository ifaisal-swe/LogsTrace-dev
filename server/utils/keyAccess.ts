// Read keys that show unmasked text follow their creator's role: when the creator loses
// logs:read_sensitive in an org (demoted or removed), those keys fall back to masked text.
export async function downgradeSensitiveKeys(orgId: string, userId: string) {
  const projects = useDb().select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.orgId, orgId))
  const rows = await useDb().update(schema.apiKeys).set({ readSensitive: false })
    .where(and(eq(schema.apiKeys.createdBy, userId), eq(schema.apiKeys.readSensitive, true), inArray(schema.apiKeys.projectId, projects)))
    .returning({ id: schema.apiKeys.id })
  if (rows.length) forgetApiKeys()
  return rows.length
}
