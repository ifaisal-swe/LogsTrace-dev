import { z } from 'zod'

export const MAX_ALERT_RULES = 50

export const alertRuleSchema = z.object({
  name: nameSchema,
  condition: alertConditionSchema,
  destination: z.enum(['discord', 'slack', 'webhook']),
  url: z.string().trim().max(500),
  cooldownMinutes: z.number().int().min(1).max(1440).default(10),
  enabled: z.boolean().default(true)
})
// Patch keeps the stored URL unless a new one is sent
export const alertRulePatchSchema = alertRuleSchema.partial().extend({ url: z.string().trim().max(500).optional() })

export async function loadAlertRule(projectId: string, id: string) {
  const [row] = await useDb().select().from(schema.alertRules)
    .where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.projectId, projectId))).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Alert not found' })
  return row
}

export async function requireConditionTemplate(projectId: string, c: z.infer<typeof alertConditionSchema>) {
  if ((c.kind === 'level' || c.kind === 'volume' || c.kind === 'text') && c.templateId) await loadTemplate(projectId, c.templateId)
}

export function publicRule(r: typeof schema.alertRules.$inferSelect) {
  const { url, createdBy: _createdBy, ...rest } = r
  return { ...rest, url: maskUrl(url) }
}
