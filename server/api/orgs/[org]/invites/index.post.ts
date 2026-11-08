import { ROLE_LABELS } from '#shared/utils/permissions'

const INVITE_DAYS = 7

export default defineEventHandler(async (event) => {
  const { org, role: actorRole, user } = await requireOrgAccess(event, 'members:manage')
  await enforceRateLimit(event, `invite:user:${user.id}`, 30, 3600)
  const { email, role } = await readValidated(event, inviteSchema)
  if (!canManageRole(actorRole, role)) throw createError({ statusCode: 403, statusMessage: 'You can only invite people to roles below your own.' })

  const db = useDb()
  const [member] = await db.select({ id: schema.users.id }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, org.id), sql`lower(${schema.users.email}) = ${email}`)).limit(1)
  if (member) throw createError({ statusCode: 409, statusMessage: 'This person is already a member.', data: { field: 'email' } })

  // Re-inviting replaces the previous pending invitation
  await db.delete(schema.invitations).where(and(
    eq(schema.invitations.orgId, org.id), eq(schema.invitations.email, email), isNull(schema.invitations.acceptedAt)
  ))
  const token = randomToken(32)
  const [invite] = await db.insert(schema.invitations).values({
    orgId: org.id, email, role, tokenHash: sha256(token), invitedBy: user.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000)
  }).returning({ id: schema.invitations.id })

  const link = appLink(`/invite/${token}`)
  // If the email can't be sent the invitation still exists; the admin gets the link to share
  const emailed = await sendMail(email, inviteEmail(user.name, org.name, ROLE_LABELS[role].label, link)).then(() => true, () => false)
  await audit(event, 'invite.created', { orgId: org.id, meta: { email, role, emailed } })
  return { id: invite!.id, link, emailed }
})
