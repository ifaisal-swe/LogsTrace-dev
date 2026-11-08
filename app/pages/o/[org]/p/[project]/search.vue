<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Search · LogsTrace' })

type Res = {
  value: string
  masked: boolean
  capped: boolean
  tables: { templateId: string | null, name: string | null, channel: string, pattern: string, count: number, last: string }[]
  rows: { id: number, ts: string, channel: string, level: string, templateId: string | null, text: string, matched: string[], fields: { name: string, type: 'number' | 'id' | 'text', value: string }[] }[]
}

const route = useRoute()
const { api, page } = useProjectPath()
const value = ref(String(route.query.value ?? ''))
const range = ref(String(route.query.range ?? 'all'))
const table = ref<string | null>(route.query.table ? String(route.query.table) : null)
const res = ref<Res | null>(null)
const loading = ref(false)
const errorMsg = ref('')

async function search() {
  const v = value.value.trim()
  navigateTo({ query: { value: v || undefined, range: range.value === 'all' ? undefined : range.value, table: table.value ?? undefined } }, { replace: true })
  if (!v) { res.value = null; return }
  loading.value = true
  errorMsg.value = ''
  try {
    res.value = await $fetch<Res>(`${api.value}/search`, { query: { value: v, from: rangeFrom(range.value), template: table.value ?? undefined } })
  } catch (err) {
    errorMsg.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}
watch([range, table], search)
onMounted(() => { if (value.value) search() })

const shownTables = computed(() => res.value?.tables ?? [])

const { enabled: aiOn } = useAi()
const mode = ref(route.query.mode === 'ask' ? 'ask' : 'value')
watch(mode, m => navigateTo({ query: { ...route.query, mode: m === 'ask' ? 'ask' : undefined } }, { replace: true }))
const modes = [
  { label: 'Find a value', value: 'value', icon: 'i-lucide-scan-search' },
  { label: 'Ask', value: 'ask', icon: 'i-lucide-sparkles' }
]
const tableLabel = (t: { name: string | null, pattern: string }) => t.name || t.pattern
</script>

<template>
  <PagePanel title="Search" log-data description="Find every message that mentions an identifier, name or value, in all tables at once.">
    <UTabs v-if="aiOn" v-model="mode" :items="modes" :content="false" variant="link" class="mb-5" />
    <AiAsk v-if="aiOn && mode === 'ask'" :api="api" :page="page" />
    <template v-else>
      <form class="flex flex-wrap gap-3" role="search" @submit.prevent="search">
        <UInput v-model="value" icon="i-lucide-search" placeholder="An id, name, plate, order number…" class="w-full sm:w-96" autofocus aria-label="Value to search for" />
        <USelect v-model="range" :items="RANGE_ITEMS" class="w-44" aria-label="Time range" />
        <UButton type="submit" :loading="loading">
          Search
        </UButton>
      </form>

      <UAlert v-if="errorMsg" class="mt-5" color="error" variant="subtle" :title="errorMsg" />
      <UAlert v-if="res?.masked" class="mt-5" color="neutral" variant="subtle" icon="i-lucide-eye-off" title="IP addresses, email addresses and tokens are hidden for your role, and can't be searched." />

      <template v-if="res">
        <p class="mt-6 text-sm text-muted" aria-live="polite">
          <template v-if="shownTables.length">
            “{{ res.value }}” appears in {{ shownTables.reduce((s, t) => s + t.count, 0).toLocaleString() }}{{ res.capped ? '+' : '' }}
            messages across {{ shownTables.length }} {{ shownTables.length === 1 ? 'table' : 'tables' }}.
          </template>
          <template v-else>
            No messages contain “{{ res.value }}” as a whole word in this time range.
          </template>
        </p>

        <div v-if="shownTables.length" class="mt-4 flex flex-wrap gap-2">
          <UButton size="sm" :color="table ? 'neutral' : 'primary'" :variant="table ? 'outline' : 'solid'" @click="table = null">
            All tables
          </UButton>
          <UButton
            v-for="t in shownTables"
            :key="t.templateId ?? 'none'"
            size="sm"
            :color="table === t.templateId ? 'primary' : 'neutral'"
            :variant="table === t.templateId ? 'solid' : 'outline'"
            class="max-w-xs"
            @click="table = t.templateId"
          >
            <span class="truncate">{{ tableLabel(t) }}</span>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ t.count.toLocaleString() }}
            </UBadge>
          </UButton>
        </div>

        <ol v-if="res.rows.length" class="mt-5 divide-y divide-default overflow-hidden rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
          <li v-for="r in res.rows" :key="r.id" class="grid gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[10.5rem_1fr]">
            <span class="text-sm tabular-nums text-muted">{{ new Date(r.ts).toLocaleString() }}</span>
            <div class="min-w-0">
              <LogText :text="r.text" :pattern="res.tables.find(t => t.templateId === r.templateId)?.pattern" class="log-line block break-words text-[0.82rem]" />
              <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span v-for="f in r.fields" :key="f.name" :class="r.matched.includes(f.name) ? 'rounded-sm bg-[var(--color-tide-100)] px-1' : ''">
                  <span class="text-muted">{{ f.name }}</span> <FieldValue :type="f.type" :value="f.value" />
                </span>
                <NuxtLink v-if="r.templateId" :to="`${page}/templates/${r.templateId}`" class="text-primary">
                  Open table
                </NuxtLink>
              </div>
            </div>
          </li>
        </ol>
      </template>
    </template>
  </PagePanel>
</template>
