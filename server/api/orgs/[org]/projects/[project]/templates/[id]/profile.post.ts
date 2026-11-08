import { z } from 'zod'

const bodySchema = rangeSchema.extend({
  field: z.number().int().min(0).max(199),
  filters: z.array(filterSchema).max(20).default([])
})

// Shape of one column under the current filters: top values, emptiness and, for numbers, spread
export default defineEventHandler(async (event) => {
  const { project, role } = await requireProjectAccess(event, 'logs:read')
  const template = await loadTemplate(project.id, getUuidParam(event, 'id'))
  const body = await readValidated(event, bodySchema)
  requireColumn(template, body.field)
  for (const f of body.filters) requireColumn(template, f.field)
  return profileColumn(template, roleCan(role, 'logs:read_sensitive'), body)
})
