// Fills in names for tables and columns nobody named yet (names people chose are kept)
export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'templates:manage')
  requireAi()
  const res = await nameTables(project.id, aiCharge(event, user.id, org.id))
  await audit(event, 'ai.tables_named', { orgId: org.id, meta: { projectId: project.id, ...res } })
  return res
})
