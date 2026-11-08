<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Tables · LogsTrace' })

const route = useRoute()
const { api, page } = useProjectPath()
const { can } = useOrgContext()
const notify = useNotify()
const { data: templates, refresh: refreshTemplates } = await useFetch<TemplateRow[]>(() => `${api.value}/templates`)

const { enabled: aiOn } = useAi()
const naming = ref(false)
const unnamedCount = computed(() => (templates.value ?? []).filter(t => !t.hidden && (!t.name || t.fields.some(f => /^field_\d+$/.test(f.name)))).length)
async function nameWithAi() {
  naming.value = true
  try {
    const res = await $fetch<{ tables: number, columns: number }>(`${api.value}/ai/name-tables`, { method: 'POST' })
    await refreshTemplates()
    notify.success(res.tables || res.columns ? `Named ${res.tables} tables and ${res.columns} columns` : 'Nothing left to name', 'Names you set yourself were kept. Rename anything any time.')
  } catch (err) { notify.error(err) } finally { naming.value = false }
}
const fresh = ref(new Set<string>())
const { status } = useProjectLive(({ events, templates: changed }) => {
  if (!templates.value || !changed.length) return
  const byId = new Map(templates.value.map(t => [t.id, t]))
  for (const t of changed) {
    const prev = byId.get(t.id)
    const spark = [...(prev?.spark ?? Array<number>(24).fill(0))]
    spark[23] = (spark[23] ?? 0) + events.filter(e => e.templateId === t.id).length
    byId.set(t.id, { ...prev, ...t, spark })
    fresh.value.add(t.id)
    setTimeout(() => fresh.value.delete(t.id), 2500)
  }
  templates.value = [...byId.values()]
})

const filter = ref(String(route.query.filter ?? ''))
const tag = ref<string | null>(route.query.tag ? String(route.query.tag) : null)
const sort = ref<'rows' | 'active' | 'newest' | 'name'>('rows')
const showHidden = ref(false)
watch([filter, tag], () => navigateTo({ query: { filter: filter.value || undefined, tag: tag.value || undefined } }, { replace: true }))

const sortItems = [
  { label: 'Most rows', value: 'rows' },
  { label: 'Recently active', value: 'active' },
  { label: 'Newest first', value: 'newest' },
  { label: 'Name', value: 'name' }
]
const allTags = computed(() => [...new Set((templates.value ?? []).flatMap(t => t.tags ?? []))].sort())
const hiddenCount = computed(() => (templates.value ?? []).filter(t => t.hidden).length)

const DAY = 86_400_000
const isNew = (t: TemplateRow) => !!t.firstSeenAt && Date.now() - new Date(t.firstSeenAt).getTime() < DAY

const shown = computed(() => {
  const needle = filter.value.toLowerCase()
  const list = (templates.value ?? []).filter(t =>
    (showHidden.value || !t.hidden)
    && (!tag.value || t.tags?.includes(tag.value))
    && (!needle || [t.name ?? '', t.pattern, t.channel, t.description ?? '', ...(t.tags ?? [])].some(x => x.toLowerCase().includes(needle))))
  const by: Record<typeof sort.value, (a: TemplateRow, b: TemplateRow) => number> = {
    rows: (a, b) => b.count - a.count,
    active: (a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt),
    newest: (a, b) => (b.firstSeenAt ?? '').localeCompare(a.firstSeenAt ?? ''),
    name: (a, b) => (a.name || '￿').localeCompare(b.name || '￿')
  }
  // Pinned tables stay on top whatever the sort
  return list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || by[sort.value](a, b))
})

// Splits a pattern so variables can be drawn as coloured slots
function parts(pattern: string, fields: { position: number, type: 'number' | 'id' | 'text', name: string }[]) {
  const byPos = new Map(fields.map(f => [f.position, f]))
  return pattern.split(' ').map((tok, i) => tok === '<*>' ? { field: byPos.get(i) } : { text: tok })
}
const sparkTitles = Array.from({ length: 24 }, (_, i) => (i === 23 ? 'This hour' : `${23 - i} h ago`))
const last24 = (t: TemplateRow) => (t.spark ?? []).reduce((s, n) => s + n, 0)
</script>

<template>
  <PagePanel title="Tables" log-data description="Each table is one kind of message. Words that change between messages become its columns.">
    <template #actions>
      <UButton v-if="aiOn && can('templates:manage') && unnamedCount" icon="i-lucide-wand-sparkles" size="sm" color="neutral" variant="outline" :loading="naming" @click="nameWithAi">
        Name with AI
      </UButton>
      <LiveStatus :status="status" />
    </template>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <UInput v-model="filter" icon="i-lucide-search" placeholder="Filter by name, tag, channel or wording" class="w-full sm:w-80" />
      <USelect v-model="sort" :items="sortItems" class="w-44" aria-label="Sort tables" />
      <USwitch v-if="hiddenCount" v-model="showHidden" :label="`Show hidden (${hiddenCount})`" />
    </div>
    <div v-if="allTags.length" class="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
      <UButton size="xs" :color="tag === null ? 'primary' : 'neutral'" :variant="tag === null ? 'solid' : 'outline'" @click="tag = null">
        All tags
      </UButton>
      <UButton v-for="t in allTags" :key="t" size="xs" :color="tag === t ? 'primary' : 'neutral'" :variant="tag === t ? 'solid' : 'outline'" @click="tag = tag === t ? null : t">
        {{ t }}
      </UButton>
    </div>

    <p v-if="!templates?.length" class="py-10 text-center text-muted">
      No tables yet. They appear as soon as messages arrive.
    </p>
    <p v-else-if="!shown.length" class="py-10 text-center text-muted">
      No tables match these filters.
    </p>
    <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
      <li v-for="t in shown" :key="t.id" :class="{ 'row-new': fresh.has(t.id), 'opacity-70': t.hidden }">
        <NuxtLink :to="`${page}/templates/${t.id}`" class="grid gap-x-6 px-4 py-3.5 hover:bg-[var(--ui-bg-muted)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:grid-cols-[1fr_8rem]">
          <div class="min-w-0">
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
              <UIcon v-if="t.pinned" name="i-lucide-pin" class="size-3.5 text-muted" aria-label="Pinned" />
              {{ t.name || 'Unnamed table' }}
              <span v-if="t.channel" class="log-line text-sm font-normal text-muted">#{{ t.channel }}</span>
              <UBadge v-if="isNew(t)" size="sm" color="primary" variant="subtle">
                New
              </UBadge>
              <UBadge v-for="tg in t.tags" :key="tg" size="sm" color="neutral" variant="outline">
                {{ tg }}
              </UBadge>
            </p>
            <p v-if="t.description" class="mt-1 line-clamp-1 text-sm text-muted">
              {{ t.description }}
            </p>
            <p class="log-line mt-1.5 line-clamp-2 text-[0.8rem] leading-relaxed">
              <template v-for="(p, i) in parts(t.pattern, t.fields)" :key="i">
                <span v-if="'text' in p" class="text-muted">{{ p.text }} </span>
                <span v-else :class="`field-${p.field?.type ?? 'text'}`" class="rounded-sm bg-[var(--ui-bg-muted)] px-1">{{ p.field?.name ?? '?' }}</span>{{ ' ' }}
              </template>
            </p>
          </div>
          <div class="mt-2 flex flex-col gap-1 sm:mt-0">
            <span class="text-sm tabular-nums text-muted sm:text-end">{{ t.count.toLocaleString() }} {{ t.count === 1 ? 'row' : 'rows' }}</span>
            <MiniBars
              v-if="t.spark"
              :values="t.spark"
              :titles="t.spark.map((n, i) => `${sparkTitles[i]}: ${n.toLocaleString()}`)"
              :label="`${last24(t).toLocaleString()} messages in the last 24 hours`"
            />
            <span class="text-xs text-muted sm:text-end">{{ last24(t).toLocaleString() }} in 24 h</span>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </PagePanel>
</template>
