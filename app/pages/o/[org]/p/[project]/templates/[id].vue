<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

type Field = { position: number, name: string, type: 'number' | 'id' | 'text' }
type Template = { id: string, name: string | null, description: string | null, tags: string[], pinned: boolean, hidden: boolean, channel: string, pattern: string, fields: Field[], count: number }
type RowsRes = { mode: 'rows', total: number, rows: { id: number, ts: string, values: string[] }[], hasMore: boolean, masked: boolean }
type SummaryRes = { mode: 'summary', columns: { groups: string[], metrics: string[] }, rows: { groups: string[], metrics: (number | null)[] }[], truncated: boolean, masked: boolean }

const route = useRoute()
const router = useRouter()
const { api, page, project } = useProjectPath()
const { can } = useOrgContext()
const notify = useNotify()
const id = String(route.params.id)

// Deletes the table and all its messages; new matching messages start a fresh table
const deleteOpen = ref(false)
const deleting = ref(false)
async function deleteTable() {
  deleting.value = true
  try {
    const res = await $fetch<{ removed: number }>(`${api.value}/templates/${id}`, { method: 'DELETE', body: { confirm: project.value } })
    deleteOpen.value = false
    notify.success('Table deleted', `${res.removed.toLocaleString()} messages removed.`)
    await navigateTo(`${page.value}/templates`)
  } catch (err) { notify.error(err) } finally { deleting.value = false }
}

const { data, refresh, error } = await useFetch<{ template: Template, masked: boolean }>(() => `${api.value}/templates/${id}`, { query: { limit: 1 } })
const template = computed(() => data.value?.template)
const fields = computed(() => template.value?.fields ?? [])
useSeoMeta({ title: () => `${template.value?.name ?? 'Table'} · LogsTrace` })

// The whole query lives in the URL so any view can be bookmarked or shared
function readQuery(): TableQuery {
  try {
    return { ...defaultQuery(), ...JSON.parse(String(route.query.q ?? '{}')) }
  } catch {
    return defaultQuery()
  }
}
const query = reactive<TableQuery>(readQuery())

const columnItems = computed(() => fields.value.map(f => ({ label: f.name, value: f.position })))
const fieldName = (pos: number | undefined) => fields.value.find(f => f.position === pos)?.name ?? '?'

function addFilter() {
  const first = fields.value[0]
  if (first) query.filters.push({ field: first.position, op: first.type === 'number' ? 'gt' : 'eq', value: '' })
}
function addMetric() {
  const num = fields.value.find(f => f.type === 'number') ?? fields.value[0]
  query.metrics.push(num ? { fn: 'sum', field: num.position } : { fn: 'count' })
}

const rows = ref<RowsRes['rows']>([])
const total = ref(0)
const hasMore = ref(false)
const pageNo = ref(0)
const summary = ref<SummaryRes | null>(null)
const masked = ref(false)
const loading = ref(false)
const queryError = ref('')

function body(extra: Record<string, unknown> = {}) {
  const ready = query.filters.filter(f => NO_VALUE_OPS.includes(f.op) || f.value.trim() !== '')
  return {
    from: rangeFrom(query.range),
    filters: ready,
    mode: query.mode,
    groupBy: query.groupBy,
    bucket: query.bucket,
    metrics: query.metrics,
    sort: query.sort,
    ...extra
  }
}

async function run(append = false) {
  loading.value = true
  queryError.value = ''
  try {
    pageNo.value = append ? pageNo.value + 1 : 0
    const res = await $fetch<RowsRes | SummaryRes>(`${api.value}/templates/${id}/query`, { method: 'POST', body: body({ page: pageNo.value }) })
    masked.value = res.masked
    if (res.mode === 'rows') {
      rows.value = append ? [...rows.value, ...res.rows] : res.rows
      total.value = res.total
      hasMore.value = res.hasMore
      summary.value = null
    } else {
      summary.value = res
    }
  } catch (err) {
    queryError.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}

const debouncedQuery = useDebounced(computed(() => JSON.stringify(query)), 400)
watch(debouncedQuery, (q) => {
  router.replace({ query: q === JSON.stringify(defaultQuery()) ? {} : { q } })
  run()
})
onMounted(() => run())

function sortBy(by: TableQuery['sort']['by']) {
  query.sort = { by, dir: query.sort.by === by && query.sort.dir === 'desc' ? 'asc' : 'desc' }
}
const sortIcon = (by: TableQuery['sort']['by']) => query.sort.by !== by ? 'i-lucide-chevrons-up-down' : query.sort.dir === 'desc' ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up'
function setMode(mode: TableQuery['mode']) {
  query.mode = mode
  query.sort = mode === 'rows' ? { by: 'ts', dir: 'desc' } : { by: query.bucket ? 'g0' : 'm0', dir: query.bucket ? 'asc' : 'desc' }
}

const exporting = ref(false)
async function exportCsv() {
  exporting.value = true
  try {
    const csv = await $fetch<string>(`${api.value}/templates/${id}/query`, { method: 'POST', body: body({ format: 'csv' }), responseType: 'text' })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${(template.value?.name || 'table').replace(/[^\w-]+/g, '_')}${query.mode === 'summary' ? '_summary' : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) { notify.error(err) } finally { exporting.value = false }
}

// Bars in summary tables are scaled to the largest value of the first metric
const maxMetric = computed(() => Math.max(1, ...(summary.value?.rows ?? []).map(r => Math.abs(r.metrics[0] ?? 0))))
const fmtNum = (n: number | null) => n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
const fmtGroup = (label: string, v: string) => (['minute', 'hour', 'day', 'week', 'month'].includes(label) && v ? new Date(v).toLocaleString() : v || '(empty)')

// Chart for summaries grouped by time
const chart = computed(() => {
  if (!summary.value || !query.bucket || summary.value.columns.groups[0] !== query.bucket) return null
  const fn = query.metrics[0]?.fn ?? 'count'
  return summaryToSeries(summary.value.rows, query.bucket, fn, summary.value.columns.metrics[0] ?? 'Value')
})

// Column profile
const profiled = ref<Field | null>(null)
function applyFilter(f: TableFilter) {
  query.filters.push(f)
  profiled.value = null
}

// Saved views
const { data: views, refresh: refreshViews } = await useFetch<SavedView[]>(() => `${api.value}/views`, { query: { kind: 'table', template: id }, default: () => [] })
const viewName = ref('')
const savingView = ref(false)
const viewOpen = ref(false)
async function saveView() {
  savingView.value = true
  try {
    await $fetch(`${api.value}/views`, { method: 'POST', body: { kind: 'table', templateId: id, name: viewName.value, query: toRaw(query) } })
    notify.success('View saved')
    viewName.value = ''
    viewOpen.value = false
    await refreshViews()
  } catch (err) { notify.error(err) } finally { savingView.value = false }
}
function openView(v: SavedView) {
  Object.assign(query, { ...defaultQuery(), ...(v.query as Partial<TableQuery>) })
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

async function patch(body: Record<string, unknown>, message: string) {
  try {
    await $fetch(`${api.value}/templates/${id}`, { method: 'PATCH', body })
    notify.success(message)
    await refresh()
  } catch (err) { notify.error(err) }
}

// Live: matching rows go on top of the default view; summaries re-run at most every 3 s
const fresh = ref(new Set<number>())
let rerun: ReturnType<typeof setTimeout> | null = null
const { status } = useProjectLive(({ events, templates }) => {
  const t = templates.find(x => x.id === id)
  if (!t || !template.value) return
  if (t.pattern !== template.value.pattern || JSON.stringify(t.fields) !== JSON.stringify(template.value.fields)) {
    if (!editing.value) refresh().then(() => run())
    return
  }
  template.value.count = t.count
  triggerRef(data)
  const mine = events.filter(e => e.templateId === id)
  if (!mine.length) return
  if (query.mode === 'summary') {
    rerun ??= setTimeout(() => { rerun = null; run() }, 3000)
    return
  }
  if (query.sort.by !== 'ts' || query.sort.dir !== 'desc') return
  const known = new Set(rows.value.map(r => r.id))
  const add = mine
    .map(e => ({ id: e.id, ts: e.ts, values: e.values }))
    .filter(r => !known.has(r.id) && rowMatches(new Map(fields.value.map((f, i) => [f.position, r.values[i] ?? ''])), body().filters as TableFilter[]))
  if (!add.length) return
  rows.value = [...add, ...rows.value]
  total.value += add.length
  for (const r of add) fresh.value.add(r.id)
  setTimeout(() => add.forEach(r => fresh.value.delete(r.id)), 2500)
})
onBeforeUnmount(() => { if (rerun) clearTimeout(rerun) })

const editing = ref(false)
const form = reactive<{ name: string, description: string, tags: string[], fields: Field[] }>({ name: '', description: '', tags: [], fields: [] })
function startEdit() {
  form.name = template.value?.name ?? ''
  form.description = template.value?.description ?? ''
  form.tags = [...(template.value?.tags ?? [])]
  form.fields = fields.value.map(f => ({ ...f }))
  editing.value = true
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch(`${api.value}/templates/${id}`, { method: 'PATCH', body: { name: form.name || null, description: form.description || null, tags: form.tags, fields: form.fields } })
    notify.success('Table saved')
    editing.value = false
    await refresh()
    await run()
  } catch (err) { notify.error(err) } finally { saving.value = false }
}

const typeItems = [
  { label: 'Number', value: 'number' },
  { label: 'Identifier', value: 'id' },
  { label: 'Text', value: 'text' }
]
const bucketItems = [
  { label: 'No time grouping', value: null },
  { label: 'Per minute', value: 'minute' },
  { label: 'Per hour', value: 'hour' },
  { label: 'Per day', value: 'day' },
  { label: 'Per week', value: 'week' },
  { label: 'Per month', value: 'month' }
]
</script>

<template>
  <PagePanel :title="template?.name || 'Unnamed table'" log-data>
    <template #actions>
      <LiveStatus :status="status" />
      <template v-if="can('templates:manage') && template && !editing">
        <UButton
          :icon="template.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="template.pinned ? 'Unpin table' : 'Pin table'"
          @click="patch({ pinned: !template.pinned }, template.pinned ? 'Table unpinned' : 'Table pinned')"
        />
        <UButton
          :icon="template.hidden ? 'i-lucide-eye' : 'i-lucide-eye-off'"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="template.hidden ? 'Show table in the list' : 'Hide table from the list'"
          @click="patch({ hidden: !template.hidden }, template.hidden ? 'Table shown in the list' : 'Table hidden from the list')"
        />
        <UButton icon="i-lucide-pencil" color="neutral" variant="outline" size="sm" @click="startEdit">
          Edit table
        </UButton>
      </template>
      <UButton v-if="can('projects:manage') && template && !editing" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" aria-label="Delete table" @click="deleteOpen = true" />
    </template>
    <ConfirmByTyping v-model:open="deleteOpen" :phrase="project" action="Delete table and its messages" :loading="deleting" @confirm="deleteTable" />

    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />
    <template v-else-if="template">
      <p class="log-line rounded-lg border border-default bg-[var(--ui-bg-elevated)] px-4 py-3 text-[0.8rem] leading-relaxed text-muted">
        {{ template.pattern }}
      </p>
      <div v-if="template.description || template.tags.length || template.hidden" class="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <UBadge v-if="template.hidden" color="neutral" variant="subtle" icon="i-lucide-eye-off">
          Hidden from list
        </UBadge>
        <UBadge v-for="t in template.tags" :key="t" color="neutral" variant="outline">
          {{ t }}
        </UBadge>
        <span v-if="template.description" class="text-muted">{{ template.description }}</span>
      </div>
      <div v-if="fields.length" class="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span class="me-1 text-muted">Explore a column</span>
        <UButton
          v-for="f in fields"
          :key="f.position"
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-chart-column"
          @click="profiled = f"
        >
          <span class="inline-block size-2 rounded-full" :style="{ background: `var(--color-field-${f.type})` }" />{{ f.name }}
        </UButton>
      </div>

      <USlideover :open="!!profiled" :title="profiled ? `Column: ${profiled.name}` : ''" description="Values under the current time range and filters." @update:open="(o: boolean) => { if (!o) profiled = null }">
        <template #body>
          <ColumnProfile
            v-if="profiled"
            :url="`${api}/templates/${id}/profile`"
            :field="profiled"
            :from="rangeFrom(query.range)"
            :filters="(body().filters as TableFilter[])"
            @filter="applyFilter"
          />
        </template>
      </USlideover>

      <section v-if="editing" class="mt-6 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-5">
        <UFormField label="Table name" help="Something people will recognise, like vehicle_sale.">
          <UInput v-model="form.name" class="w-full max-w-sm" />
        </UFormField>
        <UFormField label="Description" help="Optional. What these messages mean, for the rest of your team." class="mt-4">
          <UTextarea v-model="form.description" :rows="2" :maxlength="300" class="w-full max-w-lg" />
        </UFormField>
        <UFormField label="Tags" help="Group related tables, like billing or auth. Press Enter after each tag." class="mt-4">
          <UInputTags v-model="form.tags" :max="10" class="w-full max-w-lg" />
        </UFormField>
        <p class="mt-5 text-sm text-muted">
          Name the columns the way you'll search them, like seller, vehicle or price.
        </p>
        <div class="mt-3 grid gap-3">
          <div v-for="(f, idx) in form.fields" :key="f.position" class="grid grid-cols-[1fr_9rem] gap-3 sm:max-w-lg">
            <UInput v-model="f.name" :aria-label="`Name for column ${idx + 1}`" />
            <USelect v-model="f.type" :items="typeItems" :aria-label="`Type for column ${idx + 1}`" />
          </div>
        </div>
        <div class="mt-5 flex gap-2">
          <UButton :loading="saving" @click="save">
            Save table
          </UButton>
          <UButton color="neutral" variant="ghost" @click="editing = false">
            Cancel
          </UButton>
        </div>
      </section>

      <!-- Query builder -->
      <section class="mt-6 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4" aria-label="Query">
        <div class="flex flex-wrap items-center gap-3">
          <div class="inline-flex rounded-md border border-default p-0.5" role="group" aria-label="View">
            <UButton size="sm" :color="query.mode === 'rows' ? 'primary' : 'neutral'" :variant="query.mode === 'rows' ? 'solid' : 'ghost'" @click="setMode('rows')">
              Rows
            </UButton>
            <UButton size="sm" :color="query.mode === 'summary' ? 'primary' : 'neutral'" :variant="query.mode === 'summary' ? 'solid' : 'ghost'" @click="setMode('summary')">
              Summary
            </UButton>
          </div>
          <USelect v-model="query.range" :items="RANGE_ITEMS" size="sm" class="w-44" aria-label="Time range" />
          <UButton v-if="fields.length" icon="i-lucide-plus" size="sm" color="neutral" variant="outline" @click="addFilter">
            Add filter
          </UButton>
          <span class="flex-1" />
          <UDropdownMenu v-if="views?.length" :items="viewItems">
            <UButton icon="i-lucide-bookmark" size="sm" color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down">
              Views
            </UButton>
          </UDropdownMenu>
          <UPopover v-if="can('templates:manage')" v-model:open="viewOpen">
            <UButton icon="i-lucide-bookmark-plus" size="sm" color="neutral" variant="ghost">
              Save view
            </UButton>
            <template #content>
              <form class="flex w-72 flex-col gap-3 p-3" @submit.prevent="saveView">
                <UFormField label="View name" help="Everyone in this project can open it, including viewers. Don't filter on secrets.">
                  <UInput v-model="viewName" autofocus class="w-full" />
                </UFormField>
                <UButton type="submit" size="sm" :loading="savingView" :disabled="viewName.trim().length < 2" class="self-end">
                  Save
                </UButton>
              </form>
            </template>
          </UPopover>
          <UButton icon="i-lucide-download" size="sm" color="neutral" variant="ghost" :loading="exporting" @click="exportCsv">
            Export CSV
          </UButton>
        </div>

        <ul v-if="query.filters.length" class="mt-4 flex flex-col gap-2">
          <li v-for="(f, i) in query.filters" :key="i" class="flex flex-wrap items-center gap-2">
            <span class="w-12 text-sm text-muted">{{ i === 0 ? 'Where' : 'and' }}</span>
            <USelect v-model="f.field" :items="columnItems" size="sm" class="w-40" aria-label="Column" />
            <USelect v-model="f.op" :items="OP_ITEMS" size="sm" class="w-40" aria-label="Condition" />
            <template v-if="!NO_VALUE_OPS.includes(f.op)">
              <UInput v-model="f.value" size="sm" class="w-44" :placeholder="f.op === 'in' ? 'a, b, c' : 'Value'" aria-label="Value" />
              <template v-if="f.op === 'between'">
                <span class="text-sm text-muted">and</span>
                <UInput v-model="f.value2" size="sm" class="w-32" placeholder="Value" aria-label="Second value" />
              </template>
            </template>
            <UButton icon="i-lucide-x" size="sm" color="neutral" variant="ghost" :aria-label="`Remove filter on ${fieldName(f.field)}`" @click="query.filters.splice(i, 1)" />
          </li>
        </ul>

        <div v-if="query.mode === 'summary'" class="mt-4 grid gap-3 border-t border-default pt-4 sm:grid-cols-[auto_1fr]">
          <span class="pt-1.5 text-sm text-muted">Group by</span>
          <div class="flex flex-wrap gap-2">
            <USelect v-model="query.groupBy" :items="columnItems" multiple size="sm" class="w-56" placeholder="No columns" aria-label="Group by columns" />
            <USelect v-model="query.bucket" :items="bucketItems" size="sm" class="w-44" aria-label="Group by time" />
          </div>
          <span class="pt-1.5 text-sm text-muted">Show</span>
          <div class="flex flex-col gap-2">
            <div v-for="(m, i) in query.metrics" :key="i" class="flex flex-wrap items-center gap-2">
              <USelect v-model="m.fn" :items="AGG_ITEMS" size="sm" class="w-44" aria-label="Calculation" />
              <USelect v-if="m.fn !== 'count'" v-model="m.field" :items="columnItems" size="sm" class="w-40" aria-label="Column" />
              <UButton v-if="query.metrics.length > 1" icon="i-lucide-x" size="sm" color="neutral" variant="ghost" aria-label="Remove calculation" @click="query.metrics.splice(i, 1)" />
            </div>
            <UButton v-if="query.metrics.length < 6" icon="i-lucide-plus" size="sm" color="neutral" variant="link" class="self-start px-0" @click="addMetric">
              Add calculation
            </UButton>
          </div>
        </div>
      </section>

      <UAlert v-if="masked" class="mt-4" color="neutral" variant="subtle" icon="i-lucide-eye-off" title="IP addresses, email addresses and tokens are hidden for your role." />
      <UAlert v-if="queryError" class="mt-4" color="error" variant="subtle" :title="queryError" />

      <!-- Rows -->
      <template v-if="query.mode === 'rows'">
        <p class="mt-5 text-sm text-muted" aria-live="polite">
          {{ total.toLocaleString() }} {{ total === 1 ? 'row matches' : 'rows match' }}
        </p>
        <div class="mt-2 overflow-x-auto rounded-lg border border-default bg-[var(--ui-bg-elevated)]" :class="{ 'opacity-60': loading }">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-default">
                <th class="whitespace-nowrap px-4 py-2 font-normal text-muted">
                  <button type="button" class="inline-flex items-center gap-1" @click="sortBy('ts')">
                    Time <UIcon :name="sortIcon('ts')" class="size-3.5" />
                  </button>
                </th>
                <th v-for="f in fields" :key="f.position" class="whitespace-nowrap px-4 py-2 font-normal">
                  <button type="button" class="inline-flex items-center gap-1.5" @click="sortBy(f.position)">
                    <span class="inline-block size-2 rounded-full" :style="{ background: `var(--color-field-${f.type})` }" />{{ f.name }}
                    <UIcon :name="sortIcon(f.position)" class="size-3.5 text-muted" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id" class="border-b border-default/70 last:border-0" :class="{ 'row-new': fresh.has(r.id) }">
                <td class="whitespace-nowrap px-4 py-2 tabular-nums text-muted">
                  {{ new Date(r.ts).toLocaleString() }}
                </td>
                <td v-for="(v, i) in r.values" :key="i" class="px-4 py-2">
                  <FieldValue :type="fields[i]?.type ?? 'text'" :value="v" />
                </td>
              </tr>
              <tr v-if="!rows.length && !loading">
                <td :colspan="fields.length + 1" class="px-4 py-10 text-center text-muted">
                  No rows match. Try a longer time range or remove a filter.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="hasMore" class="mt-5 flex justify-center">
          <UButton color="neutral" variant="outline" :loading="loading" @click="run(true)">
            Load more rows
          </UButton>
        </div>
      </template>

      <!-- Summary -->
      <template v-else-if="summary">
        <section v-if="chart && chart.times.length" class="mt-5 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4" :class="{ 'opacity-60': loading }">
          <h2 class="mb-3 text-sm font-medium">
            {{ summary.columns.metrics[0] }} {{ bucketItems.find(b => b.value === query.bucket)?.label.toLowerCase() }}
          </h2>
          <TimeChart
            :times="chart.times"
            :series="chart.series"
            :mode="chart.mode"
            :bucket="query.bucket"
            :label="`${summary.columns.metrics[0]} over time`"
            :format="(n: number) => fmtNum(n)"
          />
          <p v-if="chart.hidden" class="mt-2 text-xs text-muted">
            Showing the 5 largest groups; {{ chart.hidden }} more are in the table below.
          </p>
        </section>
        <div class="mt-5 overflow-x-auto rounded-lg border border-default bg-[var(--ui-bg-elevated)]" :class="{ 'opacity-60': loading }">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-default">
                <th v-for="(g, i) in summary.columns.groups" :key="`g${i}`" class="whitespace-nowrap px-4 py-2 font-normal">
                  <button type="button" class="inline-flex items-center gap-1" @click="sortBy(`g${i}`)">
                    {{ g }} <UIcon :name="sortIcon(`g${i}`)" class="size-3.5 text-muted" />
                  </button>
                </th>
                <th v-for="(m, i) in summary.columns.metrics" :key="`m${i}`" class="whitespace-nowrap px-4 py-2 font-normal" :class="i === 0 ? 'w-1/2' : ''">
                  <button type="button" class="inline-flex items-center gap-1" @click="sortBy(`m${i}`)">
                    {{ m }} <UIcon :name="sortIcon(`m${i}`)" class="size-3.5 text-muted" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, ri) in summary.rows" :key="ri" class="border-b border-default/70 last:border-0">
                <td v-for="(g, i) in r.groups" :key="`g${i}`" class="log-line whitespace-nowrap px-4 py-2">
                  {{ fmtGroup(summary.columns.groups[i] ?? '', g) }}
                </td>
                <td v-for="(m, i) in r.metrics" :key="`m${i}`" class="px-4 py-2 tabular-nums">
                  <div v-if="i === 0" class="flex items-center gap-3">
                    <span class="h-2 rounded-sm bg-[var(--color-tide-400)]" :style="{ width: `${Math.max(2, Math.abs(m ?? 0) / maxMetric * 100)}%` }" />
                    <span>{{ fmtNum(m) }}</span>
                  </div>
                  <span v-else>{{ fmtNum(m) }}</span>
                </td>
              </tr>
              <tr v-if="!summary.rows.length">
                <td :colspan="summary.columns.groups.length + summary.columns.metrics.length" class="px-4 py-10 text-center text-muted">
                  Nothing to summarise for these filters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="summary.truncated" class="mt-3 text-sm text-muted">
          Showing the first 500 groups. Export CSV for all of them.
        </p>
      </template>

      <p class="mt-6 text-sm text-muted">
        Looking for one value in every table?
        <NuxtLink :to="`${page}/search`" class="text-primary">Search by value</NuxtLink>
      </p>
    </template>
  </PagePanel>
</template>
