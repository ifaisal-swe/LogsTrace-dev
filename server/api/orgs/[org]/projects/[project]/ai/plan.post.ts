import { z } from 'zod'

const bodySchema = z.object({
  question: z.string().trim().min(3, 'Ask a question').max(1000),
  // Refining: the plan shown to the person and what to change about it
  previous: planSchema.optional(),
  change: z.string().trim().min(3).max(500).optional()
})

// Turns a question into a plan the person can read before running it; nothing is queried here
export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'logs:read')
  requireAi()
  const body = await readValidated(event, bodySchema)
  const res = await buildPlan(project.id, body.question, aiCharge(event, user.id, org.id), body.previous, body.change)
  await audit(event, 'ai.plan', { orgId: org.id, meta: { projectId: project.id, steps: res.plan.steps.length, chars: body.question.length, refined: !!body.change } })
  return res
})
