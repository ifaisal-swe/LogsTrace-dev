export default defineEventHandler(async (event) => {
  const { org, project } = await requireProjectAccess(event, 'projects:manage')
  const rule = await loadAlertRule(project.id, getUuidParam(event, 'id'))
  await useDb().delete(schema.alertRules).where(eq(schema.alertRules.id, rule.id))
  forgetAlertRules(project.id)
  await audit(event, 'alert.deleted', { orgId: org.id, meta: { alertId: rule.id, name: rule.name } })
  return { ok: true }
})
