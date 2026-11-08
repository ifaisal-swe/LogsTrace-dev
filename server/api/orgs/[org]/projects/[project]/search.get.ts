import { z } from 'zod'

const querySchema = rangeSchema.extend({
  value: z.string().trim().min(1).max(200),
  template: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
})

export default defineEventHandler(async (event) => {
  const { project, role } = await requireProjectAccess(event, 'logs:read')
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter a value to search for.' })
  return searchValue(project.id, roleCan(role, 'logs:read_sensitive'), parsed.data)
})
