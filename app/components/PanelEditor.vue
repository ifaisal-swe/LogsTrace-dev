<script setup lang="ts">
const props = defineProps<{ panel: DashboardPanel, templates: TemplateRow[], api: string, range: string }>()
const emit = defineEmits<{ save: [p: DashboardPanel], cancel: [] }>()

const draft = reactive<DashboardPanel>(JSON.parse(JSON.stringify(props.panel)))

watch(() => draft.type, () => { draft.source = fitSource(draft, props.templates) })

const kindItems = computed(() => {
  if (draft.type === 'logs') return [{ label: 'Messages', value: 'logs' }]
  if (draft.type === 'table') return [{ label: 'A table', value: 'table' }]
  return [{ label: 'Message volume', value: 'volume' }, { label: 'A table', value: 'table' }]
})
const kind = computed({
  get: () => draft.source.kind,
  set: (k: PanelSource['kind']) => {
    if (k === draft.source.kind) return
    const t = props.templates[0]
    draft.source = k === 'volume'
      ? { kind: 'volume', split: draft.type === 'bars' ? 'channel' : 'level' }
      : k === 'logs'
        ? { kind: 'logs' }
        : { kind: 'table', templateId: t?.id ?? '', filters: [], metric: { fn: 'count' }, groupBy: draft.type === 'bars' || draft.type === 'table' ? (t?.fields[0]?.position ?? null) : null }
  }
})

const tableItems = computed(() => props.templates.map(t => ({ label: t.name || t.pattern.slice(0, 60), value: t.id })))
const tableSource = computed(() => draft.source.kind === 'table' ? draft.source : null)
const volumeSource = computed(() => draft.source.kind === 'volume' ? draft.source : null)
const logsSource = computed(() => draft.source.kind === 'logs' ? draft.source : null)
const selected = computed(() => tableSource.value ? props.templates.find(t => t.id === tableSource.value!.templateId) : undefined)
const columnItems = computed(() => (selected.value?.fields ?? []).map(f => ({ label: f.name, value: f.position })))
const groupItems = computed(() => [
  ...(draft.type === 'bars' ? [] : [{ label: 'No grouping', value: null }]),
  ...columnItems.value
])

watch(() => tableSource.value?.templateId, (id, old) => {
  const s = tableSource.value
  if (!s || id === old || old === undefined) return
  // Columns belong to one table; reset them when the table changes
  s.filters = []
  s.metric = { fn: 'count' }
  s.groupBy = draft.type === 'bars' || draft.type === 'table' ? (selected.value?.fields[0]?.position ?? null) : null
})
watch(() => tableSource.value?.metric.fn, (fn) => {
  const s = tableSource.value
  if (!s || fn === 'count' || s.metric.field !== undefined) return
  s.metric.field = (selected.value?.fields.find(f => f.type === 'number') ?? selected.value?.fields[0])?.position
})

function addFilter() {
  const s = tableSource.value
  const f = selected.value?.fields[0]
  if (s && f) s.filters.push({ field: f.position, op: f.type === 'number' ? 'gt' : 'eq', value: '' })
}

const splitItems = computed(() => [
  ...(draft.type === 'bars' ? [] : [{ label: 'No split', value: 'none' }]),
  { label: 'By level', value: 'level' },
  { label: 'By channel', value: 'channel' },
  { label: 'By table', value: 'table' }
])
const levelItems = [
  { label: 'Any level', value: undefined },
  ...[...LOG_LEVELS].reverse().map(l => ({ label: LEVEL_LABELS[l], value: l }))
]

const valid = computed(() => {
  const s = draft.source
  if (s.kind !== 'table') return true
  if (!s.templateId) return false
  if (s.metric.fn !== 'count' && s.metric.field === undefined) return false
  return !(draft.type === 'bars' && s.groupBy === null)
})

// Preview only reloads when the config settles
const preview = ref<DashboardPanel>(JSON.parse(JSON.stringify(draft)))
let timer: ReturnType<typeof setTimeout> | undefined
watch(draft, () => {
  clearTimeout(timer)
  timer = setTimeout(() => { if (valid.value) preview.value = JSON.parse(JSON.stringify(draft)) }, 500)
}, { deep: true })
onBeforeUnmount(() => clearTimeout(timer))

function save() {
  const out: DashboardPanel = JSON.parse(JSON.stringify(draft))
  if (out.source.kind === 'table') out.source.filters = out.source.filters.filter(f => ['empty', 'not_empty'].includes(f.op) || f.value.trim())
  if (out.source.kind === 'volume' && !out.source.channel) delete out.source.channel
  if (out.source.kind === 'logs') {
    if (!out.source.q) delete out.source.q
    if (!out.source.channel) delete out.source.channel
    if (!out.source.template) delete out.source.template
  }
  emit('save', out)
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
    <form class="flex flex-col gap-4" @submit.prevent="save">
      <UFormField label="Title" :help="draft.title ? undefined : `Leave empty for “${autoTitle(draft, templates)}”`">
        <UInput v-model="draft.title" :maxlength="80" class="w-full" />
      </UFormField>
      <UFormField label="Visualization">
        <USelect v-model="draft.type" :items="PANEL_TYPES" class="w-full" />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Width">
          <USelect v-model="draft.w" :items="WIDTHS" class="w-full" />
        </UFormField>
        <UFormField label="Height">
          <USelect v-model="draft.h" :items="HEIGHTS" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Data">
        <USelect v-model="kind" :items="kindItems" class="w-full" />
      </UFormField>

      <template v-if="volumeSource">
        <UFormField v-if="draft.type !== 'stat'" label="Split">
          <USelect v-model="volumeSource.split" :items="splitItems" class="w-full" />
        </UFormField>
        <UFormField label="Level">
          <USelect v-model="volumeSource.level" :items="levelItems" placeholder="Any level" class="w-full" />
        </UFormField>
        <UFormField label="Channel" help="Optional, exact match.">
          <UInput v-model="volumeSource.channel" icon="i-lucide-hash" class="w-full" />
        </UFormField>
      </template>

      <template v-if="tableSource">
        <UFormField label="Table">
          <USelectMenu v-model="tableSource.templateId" :items="tableItems" value-key="value" class="w-full" placeholder="Choose a table" />
        </UFormField>
        <UFormField label="Calculation">
          <div class="flex gap-2">
            <USelect v-model="tableSource.metric.fn" :items="AGG_ITEMS" class="w-40" />
            <USelect v-if="tableSource.metric.fn !== 'count'" v-model="tableSource.metric.field" :items="columnItems" class="min-w-0 flex-1" />
          </div>
        </UFormField>
        <UFormField v-if="draft.type !== 'stat'" label="Group by">
          <USelect v-model="tableSource.groupBy" :items="groupItems" class="w-full" />
        </UFormField>
        <UFormField label="Filters">
          <div class="flex flex-col gap-2">
            <div v-for="(f, i) in tableSource.filters" :key="i" class="flex flex-wrap items-center gap-1.5">
              <USelect v-model="f.field" :items="columnItems" size="sm" class="w-28" aria-label="Column" />
              <USelect v-model="f.op" :items="OP_ITEMS" size="sm" class="w-32" aria-label="Condition" />
              <UInput v-if="!NO_VALUE_OPS.includes(f.op)" v-model="f.value" size="sm" class="w-24" aria-label="Value" />
              <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="Remove filter" @click="tableSource.filters.splice(i, 1)" />
            </div>
            <UButton v-if="columnItems.length && tableSource.filters.length < 10" icon="i-lucide-plus" size="xs" color="neutral" variant="link" class="self-start px-0" @click="addFilter">
              Add filter
            </UButton>
          </div>
        </UFormField>
      </template>

      <template v-if="logsSource">
        <UFormField label="Search text">
          <UInput v-model="logsSource.q" icon="i-lucide-search" class="w-full" />
        </UFormField>
        <UFormField label="Level">
          <USelect v-model="logsSource.level" :items="levelItems" placeholder="Any level" class="w-full" />
        </UFormField>
        <UFormField label="Channel">
          <UInput v-model="logsSource.channel" icon="i-lucide-hash" class="w-full" />
        </UFormField>
        <UFormField label="Table">
          <USelectMenu v-model="logsSource.template" :items="[{ label: 'All tables', value: undefined }, ...tableItems]" value-key="value" class="w-full" />
        </UFormField>
      </template>

      <div class="flex gap-2 pt-2">
        <UButton type="submit" :disabled="!valid">
          Apply
        </UButton>
        <UButton color="neutral" variant="ghost" @click="emit('cancel')">
          Cancel
        </UButton>
      </div>
    </form>

    <section class="min-w-0 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4" aria-label="Preview">
      <h3 class="mb-3 text-sm font-medium">
        {{ draft.title || autoTitle(draft, templates) }}
      </h3>
      <DashboardPanel v-if="valid" :panel="preview" :api="api" :range="range" :tick="0" :templates="templates" />
      <p v-else class="py-8 text-center text-sm text-muted">
        Finish the settings on the left to see a preview.
      </p>
    </section>
  </div>
</template>
