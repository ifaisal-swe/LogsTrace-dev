export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'projects:manage')
  const current = await loadAlertRule(project.id, getUuidParam(event, 'id'))
  const body = await readValidated(event, alertRulePatchSchema)
  if (body.condition) await requireConditionTemplate(project.id, body.condition)
  const destination = body.destination ?? current.destination
  // A new destination type needs a URL of that type
  if (body.url || body.destination) await checkWebhookUrl(destination, body.url || current.url)

  const set: Partial<typeof schema.alertRules.$inferInsert> = {}
  for (const k of ['name', 'condition', 'destination', 'cooldownMinutes', 'enabled'] as const) {
    if (body[k] !== undefined) (set as Record<string, unknown>)[k] = body[k]
  }
  if (body.url) set.url = body.url
  if (Object.keys(set).length) await useDb().update(schema.alertRules).set(set).where(eq(schema.alertRules.id, current.id))
  forgetAlertRules(project.id)
  await audit(event, 'alert.updated', { orgId: org.id, meta: { alertId: current.id, changed: Object.keys(set) } })
  return publicRule(await loadAlertRule(project.id, current.id))
})
