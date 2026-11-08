import { z } from 'zod'

const bodySchema = z.object({
  request: z.string().trim().min(3, 'Describe what you need').max(1000),
  // Titles of panels already on the dashboard, when adding to one
  existing: z.array(z.string().max(80)).max(MAX_PANELS).default([])
})

// Returns a proposal only; saving goes through the normal dashboard routes and their checks
export default defineEventHandler(async (event) => {
  const { org, project, user } = await requireProjectAccess(event, 'templates:manage')
  requireAi()
  const body = await readValidated(event, bodySchema)
  const res = await buildDashboard(project.id, body.request, body.existing, aiCharge(event, user.id, org.id))
  await audit(event, 'ai.dashboard', { orgId: org.id, meta: { projectId: project.id, panels: res.panels.length, chars: body.request.length } })
  return res
})
