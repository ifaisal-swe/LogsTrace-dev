// Sends a sample notification so people can check the webhook without waiting for a real alert
export default defineEventHandler(async (event) => {
  const { project, user } = await requireProjectAccess(event, 'projects:manage')
  await enforceRateLimit(event, `alert-test:user:${user.id}`, 10, 60)
  const rule = await loadAlertRule(project.id, getUuidParam(event, 'id'))
  const ok = await sendWebhook(rule, {
    title: `Test alert from ${project.name}`,
    lines: [`Rule: ${rule.name}`, 'If you can read this, the webhook works.'],
    link: `${String(useRuntimeConfig().appUrl).replace(/\/$/, '')}`
  })
  if (!ok) {
    const fresh = await loadAlertRule(project.id, rule.id)
    throw createError({ statusCode: 502, statusMessage: `The webhook did not accept the test: ${fresh.lastError ?? 'unknown error'}` })
  }
  return { ok: true }
})
