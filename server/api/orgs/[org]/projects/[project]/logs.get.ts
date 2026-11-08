export default defineEventHandler(async (event) => {
  const { project, role, user } = await requireProjectAccess(event, 'logs:read')
  await enforceRateLimit(event, `logs:user:${user.id}`, 240, 60)
  const f = parseLogQuery(getQuery(event))
  const sensitive = roleCan(role, 'logs:read_sensitive')
  const res = await queryLogs(project.id, sensitive, f)
  return { items: res.items, nextCursor: res.nextCursor, total: res.total, masked: !sensitive }
})
