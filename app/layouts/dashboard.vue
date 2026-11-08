<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const { user, orgs, logout } = useAuth()
const orgSlug = computed(() => route.params.org ? String(route.params.org) : null)
const projectSlug = computed(() => route.params.project ? String(route.params.project) : null)
const { ctx, can } = useOrgContext()
const { data: myProjects, refresh: refreshProjects } = useMyProjects()

const currentOrg = computed(() => orgs.value.find(o => o.slug === orgSlug.value))
const currentProject = computed(() => ctx.value?.projects.find(p => p.slug === projectSlug.value))

// Remember the open project so the next sign-in lands on its logs
const last = useLastProject()
watch([orgSlug, projectSlug], ([o, p]) => { if (o && p) last.value = `${o}/${p}` }, { immediate: true })
// A project created elsewhere should show up in the switcher
watch(() => ctx.value?.projects.length, () => refreshProjects())

const switcherLabel = computed(() => {
  if (currentProject.value) return currentProject.value.name
  if (currentOrg.value) return currentOrg.value.name
  return 'Choose a project'
})
const switcherMenu = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = orgs.value.map((o) => {
    const items: DropdownMenuItem[] = [{ label: o.name, type: 'label' }]
    for (const p of (myProjects.value ?? []).filter(x => x.orgSlug === o.slug)) {
      const current = o.slug === orgSlug.value && p.projectSlug === projectSlug.value
      items.push({ label: p.projectName, icon: current ? 'i-lucide-check' : 'i-lucide-folder', to: `${projectPath(p)}/logs` })
    }
    items.push({ label: 'Organization settings & projects', icon: 'i-lucide-building-2', to: `/o/${o.slug}` })
    return items
  })
  groups.push([{ label: 'All projects', icon: 'i-lucide-layout-grid', to: '/app' }])
  return groups
})

const nav = computed<NavigationMenuItem[][]>(() => {
  const home: NavigationMenuItem = { label: 'Home', icon: 'i-lucide-house', to: '/app', exact: true }
  // No org in the URL, or one that doesn't exist / isn't yours
  if (!orgSlug.value || !ctx.value) return [[home]]

  const base = `/o/${orgSlug.value}`
  const org: NavigationMenuItem[] = [
    { label: currentOrg.value?.name ?? 'Organization', type: 'label' },
    { label: 'Projects', icon: 'i-lucide-folder', to: base, exact: true },
    { label: 'Members', icon: 'i-lucide-users', to: `${base}/members` }
  ]
  if (can('audit:read')) org.push({ label: 'Audit log', icon: 'i-lucide-scroll-text', to: `${base}/audit` })
  if (can('org:update')) org.push({ label: 'Settings', icon: 'i-lucide-settings', to: `${base}/settings` })
  if (!projectSlug.value) return [[home, ...org]]

  // Inside a project its pages come first; the organization is secondary
  const p = `${base}/p/${projectSlug.value}`
  const project: NavigationMenuItem[] = [
    home,
    { label: 'Logs', icon: 'i-lucide-list', to: `${p}/logs` },
    { label: 'Dashboards', icon: 'i-lucide-layout-dashboard', to: `${p}/dashboards` },
    { label: 'Tables', icon: 'i-lucide-table-2', to: `${p}/templates` },
    { label: 'Search', icon: 'i-lucide-scan-search', to: `${p}/search` },
    { label: 'Overview', icon: 'i-lucide-gauge', to: p, exact: true }
  ]
  if (can('projects:manage')) project.push({ label: 'Alerts', icon: 'i-lucide-bell', to: `${p}/alerts` })
  if (can('keys:manage')) project.push({ label: 'API keys', icon: 'i-lucide-key-round', to: `${p}/keys` })
  if (can('projects:manage')) project.push({ label: 'Project settings', icon: 'i-lucide-sliders-horizontal', to: `${p}/settings` })
  return [project, org]
})

const supportNav = computed<NavigationMenuItem[]>(() => [
  { label: 'Help & support', icon: 'i-lucide-life-buoy', to: '/app/support' },
  ...(isSupportStaff(user.value?.platformRole) ? [{ label: 'Support inbox', icon: 'i-lucide-inbox', to: '/app/admin/tickets' }] : [])
])

// Ctrl/Cmd+K: any project's logs, plus this project's pages
const searchGroups = computed(() => {
  const groups = [{
    id: 'projects',
    label: 'Projects',
    items: (myProjects.value ?? []).map(p => ({
      label: p.projectName,
      suffix: p.orgName,
      icon: 'i-lucide-list',
      to: `${projectPath(p)}/logs`
    }))
  }]
  if (projectSlug.value && orgSlug.value) {
    const p = `/o/${orgSlug.value}/p/${projectSlug.value}`
    groups.push({
      id: 'here',
      label: currentProject.value?.name ?? 'This project',
      items: [
        { label: 'Logs', suffix: '', icon: 'i-lucide-list', to: `${p}/logs` },
        { label: 'Dashboards', suffix: '', icon: 'i-lucide-layout-dashboard', to: `${p}/dashboards` },
        { label: 'Tables', suffix: '', icon: 'i-lucide-table-2', to: `${p}/templates` },
        { label: 'Search by value', suffix: '', icon: 'i-lucide-scan-search', to: `${p}/search` },
        { label: 'Overview', suffix: '', icon: 'i-lucide-gauge', to: p }
      ]
    })
  }
  return groups
})

const accountMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? '', type: 'label' }],
  [
    { label: 'Account and security', icon: 'i-lucide-shield', to: '/app/account' },
    { label: 'Documentation', icon: 'i-lucide-book-open', to: 'https://docs.logstrace.dev', target: '_blank' },
    ...(user.value?.platformOwner ? [{ label: 'Owner dashboard', icon: 'i-lucide-layout-grid', to: '/app/admin' }] : []),
    ...(user.value?.platformRole === 'admin' ? [{ label: 'Platform users', icon: 'i-lucide-user-cog', to: '/app/admin/users' }] : [])
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => logout() }]
])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible resizable :default-size="17" :min-size="14" :max-size="24" class="bg-[var(--ui-bg-elevated)]">
      <template #header="{ collapsed }">
        <AppLogo v-if="!collapsed" to="/app" />
      </template>

      <template #default="{ collapsed }">
        <UDropdownMenu v-if="orgs.length" :items="switcherMenu" :content="{ align: 'start' }" :ui="{ content: 'min-w-64 max-h-96' }" class="w-full">
          <UButton
            :label="collapsed ? undefined : switcherLabel"
            :icon="currentProject ? 'i-lucide-folder-open' : 'i-lucide-building-2'"
            trailing-icon="i-lucide-chevrons-up-down"
            color="neutral"
            variant="outline"
            block
            :square="collapsed"
            class="justify-between"
            aria-label="Switch project"
          />
        </UDropdownMenu>
        <UDashboardSearchButton :collapsed="collapsed" label="Jump to…" class="bg-transparent ring-default" />
        <UNavigationMenu :items="nav[0]" orientation="vertical" :collapsed="collapsed" />
        <UNavigationMenu v-if="nav[1]" :items="nav[1]" orientation="vertical" :collapsed="collapsed" class="mt-2 border-t border-default pt-3" />
        <UNavigationMenu :items="supportNav" orientation="vertical" :collapsed="collapsed" class="mt-auto border-t border-default pt-3" />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="accountMenu" :content="{ align: 'start', side: 'top' }" class="w-full">
          <UButton color="neutral" variant="ghost" block :square="collapsed" class="justify-start">
            <UAvatar :alt="user?.name" size="2xs" />
            <span v-if="!collapsed" class="truncate">{{ user?.name }}</span>
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="searchGroups" placeholder="Jump to a project or page…" :color-mode="false" />
    <slot />
  </UDashboardGroup>
</template>
