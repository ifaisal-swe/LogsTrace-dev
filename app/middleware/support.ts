export default defineNuxtRouteMiddleware(async () => {
  const { user, loaded, refresh } = useAuth()
  if (!loaded.value) await refresh()
  if (!isSupportStaff(user.value?.platformRole)) return abortNavigation(createError({ statusCode: 403, statusMessage: 'Only the support team can open this page.' }))
})
