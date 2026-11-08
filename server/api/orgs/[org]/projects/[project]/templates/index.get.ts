export default defineEventHandler(async (event) => {
  const { project, role } = await requireProjectAccess(event, 'logs:read')
  const sensitive = roleCan(role, 'logs:read_sensitive')
  const t = schema.logTemplates
  const templates = await useDb().select({
    id: t.id,
    channel: t.channel,
    pattern: t.pattern,
    name: t.name,
    description: t.description,
    tags: t.tags,
    pinned: t.pinned,
    hidden: t.hidden,
    fields: t.fields,
    count: t.count,
    firstSeenAt: t.firstSeenAt,
    lastSeenAt: t.lastSeenAt
  }).from(t)
    .where(eq(t.projectId, project.id))
    .orderBy(desc(t.count))
    .limit(500)

  const spark = await templateSparklines(project.id)
  return templates.map(x => ({ ...(sensitive ? x : maskTemplateText(x)), spark: spark.get(x.id) ?? Array<number>(24).fill(0) }))
})
