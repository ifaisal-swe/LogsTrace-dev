import { z } from 'zod'

const bodySchema = z.object({ plan: planSchema })

// Runs a plan with the caller's own access: same project, same masking, read-only
export default defineEventHandler(async (event) => {
  const { project, role, user } = await requireProjectAccess(event, 'logs:read')
  requireAi()
  await enforceRateLimit(event, `ai-run:user:${user.id}`, 10, 60)
  const { plan } = await readValidated(event, bodySchema)
  const sensitive = roleCan(role, 'logs:read_sensitive')
  const t = schema.logTemplates
  const ids = [...new Set(plan.steps.flatMap(s => ('table' in s && s.table ? [s.table] : [])))]
  const templates = ids.length
    ? await useDb().select({ id: t.id, tokens: t.tokens, fields: t.fields }).from(t).where(and(eq(t.projectId, project.id), inArray(t.id, ids)))
    : []
  try {
    checkPlanColumns(plan, new Map(templates.map(x => [x.id, x])))
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: (err as Error).message })
  }
  return { results: await runPlan(project.id, `ai-run:${user.id}`, sensitive, plan), masked: !sensitive }
})
