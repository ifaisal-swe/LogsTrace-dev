export default defineNuxtRouteMiddleware(async (to) => {
  const { user, loaded, refresh, requireEmailVerification } = useAuth()
  if (!loaded.value) await refresh()
  if (!user.value) return navigateTo({ path: '/login', query: { next: to.fullPath } })
  // Unverified accounts can only reach the code page and their account settings
  if (requireEmailVerification.value && !user.value.emailVerified && to.path !== '/verify-email' && to.path !== '/app/account') {
    return navigateTo({ path: '/verify-email', query: { next: to.fullPath } })
  }
})
