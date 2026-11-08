// Every project the signed-in user can open, across all their organizations, with a little activity
export default defineEventHandler(async (event) => {
  const user = requireVerifiedUser(event)
  const projects = await useDbClient()<{
    projectId: string, orgSlug: string, orgName: string, role: OrgRole, projectSlug: string, projectName: string
  }[]>`
    select p.id as "projectId", o.slug as "orgSlug", o.name as "orgName", m.role, p.slug as "projectSlug", p.name as "projectName"
    from memberships m
    join organizations o on o.id = m.org_id
    join projects p on p.org_id = o.id
    where m.user_id = ${user.id}
    order by o.name, p.name`
  const activity = await projectsActivity(projects.map(p => p.projectId))
  return projects.map(p => ({ ...p, last24h: activity.get(p.projectId)?.last24h ?? 0, lastEvent: activity.get(p.projectId)?.lastEvent ?? null }))
})
