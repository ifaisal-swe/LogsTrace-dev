<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const { api, page } = useProjectPath()
const { can } = useOrgContext()
const notify = useNotify()
const id = String(route.params.id)

const { data: dash, error, refresh } = await useFetch<Dashboard>(() => `${api.value}/dashboards/${id}`)
const { data: templates } = await useFetch<TemplateRow[]>(() => `${api.value}/templates`, { default: () => [] })
useSeoMeta({ title: () => `${dash.value?.name ?? 'Dashboard'} · LogsTrace` })

// Time range and refresh live in the URL so a dashboard view can be shared
const range = ref(DASH_RANGES.some(r => r.value === route.query.range) ? String(route.query.range) : '24h')
const refreshEvery = ref(REFRESH_ITEMS.some(r => String(r.value) === route.query.refresh) ? Number(route.query.refresh) : 0)
watch([range, refreshEvery], () => navigateTo({ query: { ...route.query, range: range.value, refresh: refreshEvery.value || undefined } }, { replace: true }))

const tick = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
watch(refreshEvery, (s) => {
  clearInterval(timer)
  if (s) timer = setInterval(() => { if (document.visibilityState === 'visible') tick.value++ }, s * 1000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(timer))

// Editing works on a copy; nothing is stored until "Save"
const editing = ref(route.query.edit === '1' && can('templates:manage'))
const draft = ref<DashboardPanel[]>([])
const meta = reactive({ name: '', description: '' })
function startEdit() {
  draft.value = JSON.parse(JSON.stringify(dash.value?.panels ?? []))
  meta.name = dash.value?.name ?? ''
  meta.description = dash.value?.description ?? ''
  editing.value = true
}
if (editing.value) startEdit()
const panels = computed(() => (editing.value ? draft.value : dash.value?.panels ?? []))

const editingPanel = ref<DashboardPanel | null>(null)
function addPanel() { editingPanel.value = newPanel() }
function applyPanel(p: DashboardPanel) {
  const i = draft.value.findIndex(x => x.id === p.id)
  if (!p.title) p.title = autoTitle(p, templates.value)
  if (i >= 0) draft.value[i] = p
  else draft.value.push(p)
  editingPanel.value = null
}
function move(i: number, by: number) {
  const j = i + by
  if (j < 0 || j >= draft.value.length) return
  const list = [...draft.value]
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  draft.value = list
}
function duplicate(i: number) {
  const copy = { ...JSON.parse(JSON.stringify(draft.value[i])), id: crypto.randomUUID() }
  draft.value.splice(i + 1, 0, copy)
}

const { enabled: aiOn } = useAi()
const aiOpen = ref(false)
function addFromAi(d: AiDashboardDraft) {
  draft.value.push(...d.panels.slice(0, Math.max(0, 24 - draft.value.length)))
  aiOpen.value = false
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch(`${api.value}/dashboards/${id}`, { method: 'PATCH', body: { name: meta.name, description: meta.description || null, panels: draft.value } })
    await refresh()
    editing.value = false
    notify.success('Dashboard saved')
  } catch (err) { notify.error(err) } finally { saving.value = false }
}

const confirmOpen = ref(false)
const deleting = ref(false)
async function remove() {
  deleting.value = true
  try {
    await $fetch(`${api.value}/dashboards/${id}`, { method: 'DELETE' })
    notify.success('Dashboard deleted')
    await navigateTo(`${page.value}/dashboards`)
  } catch (err) { notify.error(err) } finally { deleting.value = false }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="dash?.name ?? 'Dashboard'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <LogSourceBadge />
          <template v-if="!editing">
            <USelect v-model="range" :items="DASH_RANGES" size="sm" class="w-40" aria-label="Time range" />
            <USelect v-model="refreshEvery" :items="REFRESH_ITEMS" size="sm" class="w-40" aria-label="Auto-refresh" />
            <UButton icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="ghost" aria-label="Refresh now" @click="tick++" />
            <UButton v-if="can('templates:manage') && dash" icon="i-lucide-pencil" size="sm" color="neutral" variant="outline" @click="startEdit">
              Edit
            </UButton>
          </template>
          <template v-else>
            <UButton v-if="aiOn" icon="i-lucide-wand-sparkles" size="sm" color="neutral" variant="ghost" @click="aiOpen = true">
              Add with AI
            </UButton>
            <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="outline" @click="addPanel">
              Add panel
            </UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="editing = false">
              Cancel
            </UButton>
            <UButton size="sm" :loading="saving" :disabled="meta.name.trim().length < 2" @click="save">
              Save
            </UButton>
          </template>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />
      <template v-else-if="dash">
        <section v-if="editing" class="mb-5 grid gap-3 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4 sm:grid-cols-[16rem_1fr_auto] sm:items-end">
          <UFormField label="Name">
            <UInput v-model="meta.name" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UInput v-model="meta.description" :maxlength="300" class="w-full" />
          </UFormField>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" @click="confirmOpen = true">
            Delete dashboard
          </UButton>
        </section>
        <p v-else-if="dash.description" class="mb-5 max-w-[80ch] text-muted">
          {{ dash.description }}
        </p>

        <p v-if="!panels.length" class="py-16 text-center text-muted">
          This dashboard is empty.
          <UButton v-if="editing" variant="link" class="px-1" @click="addPanel">
            Add a panel
          </UButton>
          <UButton v-else-if="can('templates:manage')" variant="link" class="px-1" @click="startEdit">
            Edit it to add panels
          </UButton>
        </p>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-12">
          <section
            v-for="(p, i) in panels"
            :key="p.id"
            class="col-span-1 flex min-w-0 flex-col rounded-lg border bg-[var(--ui-bg-elevated)] p-4"
            :class="[SPAN_CLASS[p.w], editing ? 'border-dashed border-[var(--color-tide-400)]' : 'border-default']"
            :aria-label="p.title"
          >
            <header class="mb-3 flex items-center justify-between gap-2">
              <h2 class="truncate text-sm font-medium" :title="p.title">
                {{ p.title }}
              </h2>
              <div v-if="editing" class="flex shrink-0">
                <UButton icon="i-lucide-arrow-left" size="xs" color="neutral" variant="ghost" aria-label="Move earlier" :disabled="i === 0" @click="move(i, -1)" />
                <UButton icon="i-lucide-arrow-right" size="xs" color="neutral" variant="ghost" aria-label="Move later" :disabled="i === panels.length - 1" @click="move(i, 1)" />
                <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="Duplicate panel" @click="duplicate(i)" />
                <UButton icon="i-lucide-settings-2" size="xs" color="neutral" variant="ghost" aria-label="Edit panel" @click="editingPanel = JSON.parse(JSON.stringify(p))" />
                <UButton icon="i-lucide-x" size="xs" color="error" variant="ghost" aria-label="Remove panel" @click="draft.splice(i, 1)" />
              </div>
            </header>
            <DashboardPanel :panel="p" :api="api" :range="range" :tick="tick" :templates="templates" class="flex-1" />
          </section>
        </div>
      </template>

      <USlideover
        :open="!!editingPanel"
        :title="editingPanel && draft.some(x => x.id === editingPanel!.id) ? 'Edit panel' : 'Add panel'"
        description="Changes show in the preview. Save the dashboard to keep them."
        :ui="{ content: 'max-w-5xl' }"
        @update:open="(o: boolean) => { if (!o) editingPanel = null }"
      >
        <template #body>
          <PanelEditor v-if="editingPanel" :key="editingPanel.id" :panel="editingPanel" :templates="templates" :api="api" :range="range" @save="applyPanel" @cancel="editingPanel = null" />
        </template>
      </USlideover>
      <AiDashboardModal v-if="editing" v-model:open="aiOpen" :api="api" :existing="draft.map(p => p.title)" @use="addFromAi" />
      <ConfirmByTyping v-model:open="confirmOpen" :phrase="dash?.name ?? ''" action="Delete dashboard" :loading="deleting" @confirm="remove" />
    </template>
  </UDashboardPanel>
</template>
