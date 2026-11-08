export function useProjectPath() {
  const route = useRoute()
  const org = computed(() => String(route.params.org))
  const project = computed(() => String(route.params.project))
  const api = computed(() => `/api/orgs/${org.value}/projects/${project.value}`)
  const page = computed(() => `/o/${org.value}/p/${project.value}`)
  return { org, project, api, page }
}
