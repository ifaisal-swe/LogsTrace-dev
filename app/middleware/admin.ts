export default defineNuxtRouteMiddleware(async () => {
  const { user, loaded, refresh } = useAuth()
  if (!loaded.value) await refresh()
  if (user.value?.platformRole !== 'admin') return abortNavigation(createError({ statusCode: 403, statusMessage: 'Only platform admins can open this page.' }))
})
