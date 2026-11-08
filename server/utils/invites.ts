export async function findOpenInvite(token: string) {
  if (!token || token.length > 200) return null
  const [row] = await useDb().select({
    id: schema.invitations.id,
    orgId: schema.invitations.orgId,
    email: schema.invitations.email,
    role: schema.invitations.role,
    expiresAt: schema.invitations.expiresAt,
    orgName: schema.organizations.name,
    orgSlug: schema.organizations.slug
  }).from(schema.invitations)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.invitations.orgId))
    .where(and(eq(schema.invitations.tokenHash, sha256(token)), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, new Date())))
    .limit(1)
  return row ?? null
}
