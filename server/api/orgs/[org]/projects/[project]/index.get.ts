export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event, 'logs:read')
  const [logs, [templates]] = await Promise.all([
    projectStats(project.id),
    useDbClient()<{ n: number }[]>`select count(*)::int as n from log_templates where project_id = ${project.id}`
  ])
  return {
    project,
    stats: { total: logs.total, last24h: logs.last24h, templates: templates?.n ?? 0, last_event: logs.lastEvent },
    channels: logs.channels
  }
})
