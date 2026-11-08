import type { H3Event } from 'h3'

export async function getMembership(userId: string, orgId: string) {
  const [row] = await useDb().select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.orgId, orgId)))
    .limit(1)
  return row?.role ?? null
}

// Resolves an org by slug and checks the caller's permission. Non-members get 404 so org names don't leak.
export async function requireOrgAccess(event: H3Event, permission: Permission) {
  const user = requireVerifiedUser(event)
  const slug = getRouterParam(event, 'org') ?? ''
  const [org] = await useDb().select().from(schema.organizations).where(eq(schema.organizations.slug, slug)).limit(1)
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })

  const role = await getMembership(user.id, org.id)
  if (!role) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  if (!roleCan(role, permission)) {
    throw createError({ statusCode: 403, statusMessage: 'Your role in this organization does not allow this.' })
  }
  return { user, org, role }
}

export async function requireProjectAccess(event: H3Event, permission: Permission) {
  const ctx = await requireOrgAccess(event, permission)
  const slug = getRouterParam(event, 'project') ?? ''
  const [project] = await useDb().select().from(schema.projects)
    .where(and(eq(schema.projects.orgId, ctx.org.id), eq(schema.projects.slug, slug))).limit(1)
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  return { ...ctx, project }
}
