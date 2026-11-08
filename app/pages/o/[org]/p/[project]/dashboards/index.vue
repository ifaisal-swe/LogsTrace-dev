<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Dashboards · LogsTrace' })

const { api, page } = useProjectPath()
const { can } = useOrgContext()
const notify = useNotify()
const { data: list, refresh, pending } = await useFetch<DashboardRow[]>(() => `${api.value}/dashboards`, { default: () => [] })

// Projects created before dashboards existed get their overview the first time someone who can edit opens this page
const starting = ref(false)
async function createStarter(open = false) {
  starting.value = true
  try {
    const { id } = await $fetch<{ id: string }>(`${api.value}/dashboards/starter`, { method: 'POST' })
    if (open) await navigateTo(`${page.value}/dashboards/${id}`)
    else await refresh()
  } catch (err) { notify.error(err) } finally { starting.value = false }
}
onMounted(() => { if (!list.value.length && can('templates:manage')) createStarter() })

const { enabled: aiOn } = useAi()
const aiOpen = ref(false)
async function createFromAi(draft: AiDashboardDraft) {
  creating.value = true
  try {
    const { id } = await $fetch<{ id: string }>(`${api.value}/dashboards`, { method: 'POST', body: { name: draft.name, description: draft.description, panels: draft.panels } })
    await navigateTo(`${page.value}/dashboards/${id}`)
  } catch (err) { notify.error(err) } finally { creating.value = false }
}

const name = ref('')
const createOpen = ref(false)
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    const { id } = await $fetch<{ id: string }>(`${api.value}/dashboards`, { method: 'POST', body: { name: name.value, panels: [] } })
    await navigateTo({ path: `${page.value}/dashboards/${id}`, query: { edit: '1' } })
  } catch (err) { notify.error(err) } finally { creating.value = false }
}
</script>

<template>
  <PagePanel title="Dashboards" description="Charts, numbers and log streams on one screen, with one time range for all of them.">
    <template #actions>
      <UButton v-if="can('templates:manage')" icon="i-lucide-sparkles" color="neutral" variant="ghost" size="sm" :loading="starting" @click="createStarter(true)">
        New project overview
      </UButton>
      <UButton v-if="aiOn && can('templates:manage')" icon="i-lucide-wand-sparkles" color="neutral" variant="outline" size="sm" @click="aiOpen = true">
        Build with AI
      </UButton>
      <UPopover v-if="can('templates:manage')" v-model:open="createOpen">
        <UButton icon="i-lucide-plus" size="sm">
          New dashboard
        </UButton>
        <template #content>
          <form class="flex w-72 flex-col gap-3 p-3" @submit.prevent="create">
            <UFormField label="Dashboard name">
              <UInput v-model="name" autofocus class="w-full" placeholder="Checkout health" />
            </UFormField>
            <UButton type="submit" size="sm" :loading="creating" :disabled="name.trim().length < 2" class="self-end">
              Create
            </UButton>
          </form>
        </template>
      </UPopover>
    </template>

    <AiDashboardModal v-model:open="aiOpen" :api="api" :busy="creating" @use="createFromAi" />

    <p v-if="!list.length && !pending && !starting" class="py-10 text-center text-muted">
      No dashboards yet.{{ can('templates:manage') ? '' : ' Ask a member or admin to create one.' }}
    </p>
    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li v-for="d in list" :key="d.id">
        <NuxtLink :to="`${page}/dashboards/${d.id}`" class="block h-full rounded-lg border border-default bg-[var(--ui-bg-elevated)] px-5 py-4 hover:border-[var(--color-tide-400)] focus-visible:outline-2 focus-visible:outline-primary">
          <p class="flex items-center gap-2 font-medium">
            <UIcon name="i-lucide-layout-dashboard" class="size-4 text-muted" />{{ d.name }}
          </p>
          <p v-if="d.description" class="mt-1 line-clamp-2 text-sm text-muted">
            {{ d.description }}
          </p>
          <p class="mt-2 text-xs text-muted">
            {{ d.panelCount }} {{ d.panelCount === 1 ? 'panel' : 'panels' }} · updated {{ new Date(d.updatedAt).toLocaleDateString() }}
          </p>
        </NuxtLink>
      </li>
    </ul>
  </PagePanel>
</template>
