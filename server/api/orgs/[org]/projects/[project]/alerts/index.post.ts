import { count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'projects:manage')
  const body = await readValidated(event, alertRuleSchema)
  await requireConditionTemplate(project.id, body.condition)
  await checkWebhookUrl(body.destination, body.url)

  const db = useDb()
  const [row] = await db.select({ n: count() }).from(schema.alertRules).where(eq(schema.alertRules.projectId, project.id))
  if ((row?.n ?? 0) >= MAX_ALERT_RULES) throw createError({ statusCode: 400, statusMessage: `A project can have up to ${MAX_ALERT_RULES} alerts.` })

  const [rule] = await db.insert(schema.alertRules).values({ ...body, projectId: project.id, createdBy: user.id }).returning()
  forgetAlertRules(project.id)
  await audit(event, 'alert.created', { orgId: org.id, meta: { alertId: rule!.id, name: body.name, destination: body.destination, kind: body.condition.kind } })
  return publicRule(rule!)
})
