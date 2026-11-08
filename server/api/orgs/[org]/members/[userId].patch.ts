export default defineEventHandler(async (event) => {
  const { org, role: actorRole, user } = await requireOrgAccess(event, 'members:manage')
  const targetId = getUuidParam(event, 'userId')
  const { role: newRole } = await readValidated(event, roleChangeSchema)

  const targetRole = await getMembership(targetId, org.id)
  if (!targetRole) throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  if (targetId === user.id) throw createError({ statusCode: 400, statusMessage: 'You can\'t change your own role. Ask another owner or admin.' })
  if (!canManageRole(actorRole, targetRole) || !canManageRole(actorRole, newRole)) {
    throw createError({ statusCode: 403, statusMessage: 'You can only manage roles below your own.' })
  }
  if (targetRole === 'owner' && newRole !== 'owner' && (await countOwners(org.id)) <= 1) {
    throw createError({ statusCode: 400, statusMessage: 'An organization needs at least one owner.' })
  }

  await useDb().update(schema.memberships).set({ role: newRole })
    .where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, targetId)))
  const downgraded = roleCan(newRole, 'logs:read_sensitive') ? 0 : await downgradeSensitiveKeys(org.id, targetId)
  await audit(event, 'member.role_changed', { orgId: org.id, meta: { targetId, from: targetRole, to: newRole, keysMasked: downgraded } })
  return { ok: true }
})
