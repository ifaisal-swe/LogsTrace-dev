export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const { name } = await readValidated(event, profileSchema)
  await useDb().update(schema.users).set({ name, updatedAt: new Date() }).where(eq(schema.users.id, user.id))
  return { ok: true }
})
