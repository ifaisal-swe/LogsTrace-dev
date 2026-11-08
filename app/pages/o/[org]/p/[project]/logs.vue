<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Logs · LogsTrace' })

type LogItem = { id: number, ts: string, channel: string, level: string, text: string, data: Record<string, unknown>, templateId: string | null, traceId: string | null, spanId: string | null }

const route = useRoute()
const { api, page } = useProjectPath()
const notify = useNotify()
const { can } = useOrgContext()

const q = ref(String(route.query.q ?? ''))
const channel = ref(String(route.query.channel ?? ''))
const level = ref<LogLevel | undefined>(normalizeLevel(route.query.level) ?? undefined)
const template = ref<string | undefined>(route.query.template ? String(route.query.template) : undefined)
const trace = ref(String(route.query.trace ?? ''))
// "user.id=42, plan=pro": exact matches on fields of the JSON data
const dataFilter = ref(String(route.query.data ?? ''))
const showMore = ref(!!(trace.value || dataFilter.value))
const { data: templates } = await useFetch<TemplateRow[]>(() => `${api.value}/templates`, { default: () => [] })
const patternById = computed(() => new Map((templates.value ?? []).map(t => [t.id, t.pattern])))
const templateItems = computed(() => [
  { label: 'All tables', value: undefined },
  ...(templates.value ?? []).filter(t => !t.hidden || t.id === template.value).map(t => ({ label: t.name || t.pattern.slice(0, 60), value: t.id }))
])
const debouncedQ = useDebounced(q, 350)
const debouncedChannel = useDebounced(channel, 350)
const debouncedTrace = useDebounced(trace, 350)
const debouncedData = useDebounced(dataFilter, 500)

function dataPairs(raw: string) {
  return raw.split(',').map(p => p.trim()).filter(Boolean).flatMap((p) => {
    const i = p.indexOf('=')
    return i > 0 ? [[p.slice(0, i).trim(), p.slice(i + 1).trim()] as const] : []
  })
}
const getPath = (obj: unknown, path: string) => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)

const items = ref<LogItem[]>([])
const nextCursor = ref<string | null>(null)
const masked = ref(false)
const loading = ref(false)
const expanded = ref<number | null>(null)
// How many messages match the current filters (only counted while filtering)
const total = ref<number | null>(null)

// One message, e.g. logged by mistake; bulk deletes live in Project settings
const toDelete = ref<LogItem | null>(null)
const deletingOne = ref(false)
async function deleteOne() {
  const e = toDelete.value
  if (!e) return
  deletingOne.value = true
  try {
    await $fetch(`${api.value}/logs/${e.id}`, { method: 'DELETE' })
    items.value = items.value.filter(i => i.id !== e.id)
    if (total.value) total.value--
    toDelete.value = null
    notify.success('Message deleted')
  } catch (err) { notify.error(err) } finally { deletingOne.value = false }
}

function filters() {
  return {
    q: debouncedQ.value.trim() || undefined,
    channel: debouncedChannel.value.trim() || undefined,
    level: level.value,
    template: template.value,
    trace: debouncedTrace.value.trim() || undefined,
    data: debouncedData.value.trim() || undefined
  }
}
function apiQuery() {
  const { data, ...rest } = filters()
  return { ...rest, ...Object.fromEntries(dataPairs(data ?? '').map(([k, v]) => [`data.${k}`, v])) }
}

const filtering = computed(() => Object.values(filters()).some(v => v !== undefined))

async function load(reset = true) {
  loading.value = true
  try {
    // The count only matters for a new search, not for "Load older messages"
    const count = reset && filtering.value
    const res = await $fetch<{ items: LogItem[], nextCursor: string | null, masked: boolean, total?: number }>(`${api.value}/logs`, {
      query: { ...apiQuery(), cursor: reset ? undefined : nextCursor.value ?? undefined, includeTotal: count ? 'true' : undefined }
    })
    if (reset) {
      pending.value = []
      total.value = count ? res.total ?? null : null
    }
    items.value = reset ? res.items : [...items.value, ...res.items]
    nextCursor.value = res.nextCursor
    masked.value = res.masked
  } catch (err) { notify.error(err) } finally { loading.value = false }
}

// Filters live in the URL so a filtered view can be shared or bookmarked
watch([debouncedQ, debouncedChannel, level, template, debouncedTrace, debouncedData], () => {
  navigateTo({ query: filters() }, { replace: true })
  load()
})
onMounted(() => load())

// Live: new messages matching the filters go on top; while paused they wait in `pending`
const MAX_ROWS = 2000
const paused = ref(false)
const pending = ref<LogItem[]>([])
const fresh = ref(new Set<number>())

function matches(e: LogItem) {
  const f = filters()
  if (f.channel !== undefined && e.channel !== f.channel) return false
  if (f.level && e.level !== f.level) return false
  if (f.template && e.templateId !== f.template) return false
  if (f.trace && e.traceId !== f.trace) return false
  if (dataPairs(f.data ?? '').some(([k, v]) => String(getPath(e.data, k) ?? '') !== v)) return false
  return !f.q || e.text.toLowerCase().includes(f.q.toLowerCase())
}

function prepend(list: LogItem[]) {
  const known = new Set(items.value.map(i => i.id))
  const add = list.filter(e => !known.has(e.id))
  if (!add.length) return
  const merged = [...add, ...items.value].sort((a, b) => b.ts.localeCompare(a.ts) || b.id - a.id)
  if (merged.length > MAX_ROWS) {
    merged.length = MAX_ROWS
    const last = merged.at(-1)!
    nextCursor.value = `${new Date(last.ts).toISOString()}_${last.id}`
  }
  items.value = merged
  if (total.value !== null) total.value += add.length
  for (const e of add) fresh.value.add(e.id)
  setTimeout(() => add.forEach(e => fresh.value.delete(e.id)), 2500)
}

const { status } = useProjectLive(({ events }) => {
  if (loading.value) return
  const list: LogItem[] = events.filter(matches)
  if (!list.length) return
  if (paused.value) pending.value = [...list, ...pending.value].slice(0, MAX_ROWS)
  else prepend(list)
})

function showPending() {
  prepend(pending.value)
  pending.value = []
}
watch(paused, (p) => { if (!p) showPending() })

// Saved views
const { data: views, refresh: refreshViews } = await useFetch<SavedView[]>(() => `${api.value}/views`, { query: { kind: 'logs' }, default: () => [] })
const viewName = ref('')
const viewOpen = ref(false)
const savingView = ref(false)
async function saveView() {
  savingView.value = true
  try {
    await $fetch(`${api.value}/views`, { method: 'POST', body: { kind: 'logs', name: viewName.value, query: filters() } })
    notify.success('View saved')
    viewName.value = ''
    viewOpen.value = false
    await refreshViews()
  } catch (err) { notify.error(err) } finally { savingView.value = false }
}
function openView(v: SavedView) {
  const f = v.query as { q?: string, channel?: string, level?: string, template?: string, trace?: string, data?: string }
  q.value = f.q ?? ''
  channel.value = f.channel ?? ''
  level.value = normalizeLevel(f.level) ?? undefined
  template.value = f.template
  trace.value = f.trace ?? ''
  dataFilter.value = f.data ?? ''
  showMore.value = !!(f.trace || f.data)
}
async function deleteView(v: SavedView) {
  try {
    await $fetch(`${api.value}/views/${v.id}`, { method: 'DELETE' })
    await refreshViews()
  } catch (err) { notify.error(err) }
}
const viewItems = computed(() => [
  (views.value ?? []).map(v => ({ label: v.name, icon: 'i-lucide-bookmark', onSelect: () => openView(v) })),
  ...(can('templates:manage') && views.value?.length
    ? [[{ label: 'Delete a view', type: 'label' as const }, ...(views.value ?? []).map(v => ({ label: v.name, icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteView(v) }))]]
    : [])
])

const levels = [
  { label: 'All levels', value: undefined },
  ...[...LOG_LEVELS].reverse().map(l => ({ label: LEVEL_LABELS[l], value: l }))
]
</script>

<template>
  <PagePanel title="Logs" log-data>
    <template #actions>
      <LiveStatus :status="status" :paused="paused" />
      <UButton
        v-if="status === 'live'"
        :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
        color="neutral"
        variant="outline"
        size="sm"
        @click="paused = !paused"
      >
        {{ paused ? 'Resume' : 'Pause' }}
      </UButton>
    </template>
    <div class="mb-5 flex flex-wrap gap-3">
      <UInput v-model="q" icon="i-lucide-search" placeholder="Search message text" class="w-full sm:w-80" />
      <UInput v-model="channel" icon="i-lucide-hash" placeholder="Channel" class="w-44" />
      <USelect v-model="level" :items="levels" class="w-40" placeholder="All levels" />
      <USelectMenu v-model="template" :items="templateItems" value-key="value" class="w-60" placeholder="All tables" aria-label="Table" />
      <UButton :icon="showMore ? 'i-lucide-chevron-up' : 'i-lucide-sliders-horizontal'" color="neutral" variant="ghost" @click="showMore = !showMore">
        More filters
      </UButton>
      <span class="flex-1" />
      <UDropdownMenu v-if="views?.length" :items="viewItems">
        <UButton icon="i-lucide-bookmark" color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down">
          Views
        </UButton>
      </UDropdownMenu>
      <UPopover v-if="can('templates:manage')" v-model:open="viewOpen">
        <UButton icon="i-lucide-bookmark-plus" color="neutral" variant="ghost">
          Save view
        </UButton>
        <template #content>
          <form class="flex w-72 flex-col gap-3 p-3" @submit.prevent="saveView">
            <UFormField label="View name" help="Saves the search and filters. Everyone in this project can open it, including viewers.">
              <UInput v-model="viewName" autofocus class="w-full" />
            </UFormField>
            <UButton type="submit" size="sm" :loading="savingView" :disabled="viewName.trim().length < 2" class="self-end">
              Save
            </UButton>
          </form>
        </template>
      </UPopover>
    </div>
    <div v-if="showMore" class="-mt-2 mb-5 flex flex-wrap gap-3">
      <UInput v-model="trace" icon="i-lucide-route" placeholder="Trace id" class="w-64" aria-label="Trace id" />
      <UInput v-model="dataFilter" icon="i-lucide-braces" placeholder="Data fields, e.g. user.id=42, plan=pro" class="w-full sm:w-96" aria-label="Data field filters" />
    </div>
    <UAlert v-if="masked" class="mb-4" color="neutral" variant="subtle" icon="i-lucide-eye-off" title="IP addresses, email addresses and tokens are hidden for your role." />

    <p v-if="total !== null" class="mb-2 text-sm text-muted" aria-live="polite">
      {{ total.toLocaleString() }} {{ total === 1 ? 'message' : 'messages' }} found
    </p>
    <div v-if="pending.length" class="mb-3 flex justify-center">
      <UButton icon="i-lucide-arrow-up" size="sm" @click="showPending">
        Show {{ pending.length.toLocaleString() }} new {{ pending.length === 1 ? 'message' : 'messages' }}
      </UButton>
    </div>
    <ol v-if="items.length" class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
      <li v-for="e in items" :key="e.id" :class="{ 'row-new': fresh.has(e.id) }">
        <button
          type="button"
          class="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-2.5 text-start hover:bg-[var(--ui-bg-muted)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:grid-cols-[10.5rem_7rem_1fr]"
          :aria-expanded="expanded === e.id"
          @click="expanded = expanded === e.id ? null : e.id"
        >
          <span class="text-sm tabular-nums text-muted">{{ new Date(e.ts).toLocaleString() }}</span>
          <span class="log-line truncate text-sm text-muted">{{ e.channel || '—' }}</span>
          <LogText :text="e.text" :pattern="e.templateId ? patternById.get(e.templateId) : null" class="log-line col-span-2 whitespace-pre-wrap break-words text-[0.82rem] sm:col-span-1" :class="expanded === e.id ? '' : 'line-clamp-2'" />
        </button>
        <div v-if="expanded === e.id" class="flex flex-wrap items-center gap-3 border-t border-default bg-[var(--ui-bg-muted)] px-4 py-3 text-sm">
          <UBadge :color="LEVEL_BADGE[e.level as LogLevel] ?? 'neutral'" variant="subtle">
            {{ e.level }}
          </UBadge>
          <NuxtLink v-if="e.templateId" :to="`${page}/templates/${e.templateId}`" class="text-primary">
            Open its table
          </NuxtLink>
          <button v-if="e.traceId && trace !== e.traceId" type="button" class="text-primary" @click="trace = e.traceId!; showMore = true">
            Show its trace
          </button>
          <span v-if="e.traceId" class="log-line text-xs text-muted">trace {{ e.traceId }}{{ e.spanId ? ` · span ${e.spanId}` : '' }}</span>
          <UButton v-if="can('projects:manage')" class="ms-auto" icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" @click="toDelete = e">
            Delete message
          </UButton>
          <pre v-if="Object.keys(e.data).length" class="log-line w-full overflow-x-auto text-[0.78rem]">{{ JSON.stringify(e.data, null, 2) }}</pre>
        </div>
      </li>
    </ol>
    <p v-else-if="!loading" class="py-10 text-center text-muted">
      No messages match these filters.
    </p>

    <UModal :open="!!toDelete" title="Delete this message?" @update:open="(o: boolean) => { if (!o) toDelete = null }">
      <template #body>
        <p class="text-muted">
          It's removed for good, also from tables, search and dashboards.
        </p>
        <LogText v-if="toDelete" :text="toDelete.text" class="log-line mt-3 line-clamp-3 whitespace-pre-wrap break-words text-[0.82rem]" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="toDelete = null">
            Cancel
          </UButton>
          <UButton color="error" :loading="deletingOne" @click="deleteOne">
            Delete message
          </UButton>
        </div>
      </template>
    </UModal>

    <div v-if="nextCursor" class="mt-5 flex justify-center">
      <UButton color="neutral" variant="outline" :loading="loading" @click="load(false)">
        Load older messages
      </UButton>
    </div>
  </PagePanel>
</template>
