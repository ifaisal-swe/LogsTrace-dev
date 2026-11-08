export default defineEventHandler(async (event) => {
  const user = requireVerifiedUser(event)
  const targetId = getUuidParam(event, 'userId')
  const leaving = targetId === user.id

  // Leaving needs only membership; removing someone else needs members:manage
  const { org, role: actorRole } = await requireOrgAccess(event, leaving ? 'logs:read' : 'members:manage')
  const targetRole = leaving ? actorRole : await getMembership(targetId, org.id)
  if (!targetRole) throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  if (!leaving && !canManageRole(actorRole, targetRole)) {
    throw createError({ statusCode: 403, statusMessage: 'You can only remove members below your own role.' })
  }
  if (targetRole === 'owner' && (await countOwners(org.id)) <= 1) {
    throw createError({ statusCode: 400, statusMessage: 'An organization needs at least one owner. Make someone else owner first.' })
  }

  await useDb().delete(schema.memberships).where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, targetId)))
  const downgraded = await downgradeSensitiveKeys(org.id, targetId)
  await audit(event, leaving ? 'member.left' : 'member.removed', { orgId: org.id, meta: { targetId, keysMasked: downgraded } })
  return { ok: true }
})
