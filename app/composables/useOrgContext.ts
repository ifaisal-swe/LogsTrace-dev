type OrgContext = {
  org: { id: string, name: string, slug: string }
  role: OrgRole
  permissions: Permission[]
  projects: { id: string, name: string, slug: string }[]
}

export function useOrgContext() {
  const route = useRoute()
  const slug = computed(() => String(route.params.org ?? ''))
  const { data, refresh, error } = useFetch<OrgContext>(() => `/api/orgs/${slug.value}`, {
    key: computed(() => `org:${slug.value}`),
    immediate: !!slug.value,
    watch: [slug]
  })
  const can = (p: Permission) => !!data.value?.permissions.includes(p)
  return { slug, ctx: data, refresh, error, can }
}
