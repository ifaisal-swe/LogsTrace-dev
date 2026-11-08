export default defineNuxtRouteMiddleware(async () => {
  const { user, loaded, refresh } = useAuth()
  if (!loaded.value) await refresh()
  if (!user.value?.platformOwner) return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})
