export type AuthUser = { id: string, email: string, name: string, platformRole: 'user' | 'moderator' | 'admin', emailVerified: boolean, platformOwner: boolean }
export type UserOrg = { id: string, name: string, slug: string, role: OrgRole }

export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const orgs = useState<UserOrg[]>('auth:orgs', () => [])
  const requireEmailVerification = useState('auth:requireVerification', () => false)
  const loaded = useState('auth:loaded', () => false)

  async function refresh() {
    const data = await useRequestFetch()('/api/auth/me')
    user.value = data.user
    orgs.value = data.orgs as UserOrg[]
    requireEmailVerification.value = 'requireEmailVerification' in data && !!data.requireEmailVerification
    loaded.value = true
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    orgs.value = []
    await navigateTo('/login')
  }

  return { user, orgs, loaded, requireEmailVerification, refresh, logout }
}
