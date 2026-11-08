<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { api, page } = useProjectPath()
const { can } = useOrgContext()
const { data, error } = await useFetch<ProjectOverview>(() => api.value)
useSeoMeta({ title: () => `${data.value?.project.name ?? 'Project'} · LogsTrace` })

const origin = useRequestURL().origin
const example = computed(() => `curl -X POST ${origin}/api/ingest \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"events":[{"channel":"api","text":"GET /orders/10293 returned 200 in 84 ms"}]}'`)
const fmt = (n: number | undefined) => (n ?? 0).toLocaleString()

// Activity chart: messages per bucket, stacked by level
type Activity = { bucket: Bucket, rows: { t: string, level: string, n: number }[] }
const range = ref<'24h' | '7d' | '30d'>('24h')
const { data: activity, pending: activityLoading } = await useFetch<Activity>(() => `${api.value}/activity`, { query: { range } })
const LEVELS = [
  { level: 'fatal', name: 'Fatal', color: 'var(--chart-fatal)' },
  { level: 'error', name: 'Error', color: 'var(--chart-error)' },
  { level: 'warn', name: 'Warning', color: 'var(--chart-warn)' },
  { level: 'info', name: 'Info', color: 'var(--chart-info)' },
  { level: 'debug', name: 'Debug', color: 'var(--chart-debug)' }
]
const activityChart = computed(() => {
  const a = activity.value
  if (!a?.rows.length) return null
  // Span the whole range so quiet stretches show as empty, not missing
  const now = new Date()
  if (a.bucket === 'hour') now.setUTCMinutes(0, 0, 0)
  else now.setUTCHours(0, 0, 0, 0)
  const start = new Date(now.getTime() - ({ '24h': 23 * 3600_000, '7d': (7 * 24 - 1) * 3600_000, '30d': 29 * 86400_000 })[range.value])
  const times = fillTimes([...a.rows.map(r => r.t), start.toISOString(), now.toISOString()], a.bucket)
  const index = new Map(times.map((t, i) => [new Date(t).getTime(), i]))
  const present = LEVELS.filter(l => a.rows.some(r => r.level === l.level))
  const series = present.map(l => ({ name: l.name, color: l.color, values: Array<number | null>(times.length).fill(0) }))
  for (const r of a.rows) {
    const s = series[present.findIndex(l => l.level === r.level)]
    const i = index.get(new Date(r.t).getTime())
    if (s && i !== undefined) s.values[i] = r.n
  }
  return { times, series, bucket: a.bucket }
})
const rangeItems = [
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' }
]

// Counters move with each live batch instead of re-running the count queries
const { status } = useProjectLive(({ events, newTemplates }) => {
  const d = data.value
  if (!d?.stats || !events.length) return
  const dayAgo = Date.now() - 86400_000
  d.stats.total += events.length
  d.stats.last24h += events.filter(e => new Date(e.ts).getTime() > dayAgo).length
  d.stats.templates += newTemplates.length
  const newest = events.reduce((m, e) => (e.ts > m ? e.ts : m), d.stats.last_event ?? '')
  d.stats.last_event = newest || d.stats.last_event
  const weekAgo = Date.now() - 7 * 86400_000
  for (const e of events) {
    if (new Date(e.ts).getTime() <= weekAgo) continue
    const c = d.channels.find(x => x.channel === e.channel)
    if (c) c.n++
    else d.channels.push({ channel: e.channel, n: 1 })
  }
  d.channels.sort((a, b) => b.n - a.n)
  const a = activity.value
  if (a) {
    for (const e of events) {
      const t = new Date(e.ts)
      if (a.bucket === 'hour') t.setUTCMinutes(0, 0, 0)
      else t.setUTCHours(0, 0, 0, 0)
      const iso = t.toISOString()
      const row = a.rows.find(r => r.t === iso && r.level === e.level)
      if (row) row.n++
      else a.rows.push({ t: iso, level: e.level, n: 1 })
    }
    triggerRef(activity)
  }
  if (d.channels.length > 12) d.channels.length = 12
  // useFetch data is a shallow ref
  triggerRef(data)
})
</script>

<template>
  <PagePanel :title="data?.project.name ?? 'Project'" log-data>
    <template #actions>
      <LiveStatus :status="status" />
    </template>
    <UAlert v-if="error" color="error" variant="subtle" :title="apiErrorMessage(error)" />
    <template v-else-if="data">
      <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-default bg-[var(--ui-border)] sm:grid-cols-4">
        <div class="bg-[var(--ui-bg-elevated)] p-4">
          <dt class="text-sm text-muted">
            Messages
          </dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums">
            {{ fmt(data.stats?.total) }}
          </dd>
        </div>
        <div class="bg-[var(--ui-bg-elevated)] p-4">
          <dt class="text-sm text-muted">
            Last 24 hours
          </dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums">
            {{ fmt(data.stats?.last24h) }}
          </dd>
        </div>
        <div class="bg-[var(--ui-bg-elevated)] p-4">
          <dt class="text-sm text-muted">
            Tables found
          </dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums">
            {{ fmt(data.stats?.templates) }}
          </dd>
        </div>
        <div class="bg-[var(--ui-bg-elevated)] p-4">
          <dt class="text-sm text-muted">
            Last message
          </dt>
          <dd class="mt-1 text-sm font-medium">
            {{ data.stats?.last_event ? new Date(data.stats.last_event).toLocaleString() : 'None yet' }}
          </dd>
        </div>
      </dl>

      <section v-if="!data.stats?.total" class="mt-10">
        <h2 class="text-lg font-medium">
          Send your first message
        </h2>
        <ol class="mt-4 flex flex-col gap-4">
          <li>
            <p class="font-medium">
              1. Create an API key
            </p>
            <p class="text-sm text-muted">
              <NuxtLink v-if="can('keys:manage')" :to="`${page}/keys`" class="text-primary">Open API keys</NuxtLink>
              <span v-else>Ask an admin of this organization to create one for you.</span>
            </p>
          </li>
          <li>
            <p class="font-medium">
              2. Post a message
            </p>
            <pre class="log-line mt-2 overflow-x-auto rounded-lg bg-[var(--color-moss-950)] p-4 text-[0.78rem] leading-6 text-[var(--color-moss-200)]">{{ example }}</pre>
          </li>
          <li>
            <p class="font-medium">
              3. Open Logs and Tables
            </p>
            <p class="text-sm text-muted">
              Send the same kind of message twice with different values and it becomes a table.
            </p>
          </li>
        </ol>
      </section>

      <section v-else class="mt-8 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4" :class="{ 'opacity-60': activityLoading }">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-medium">
            Messages over time
          </h2>
          <USelect v-model="range" :items="rangeItems" size="sm" class="w-40" aria-label="Chart time range" />
        </div>
        <TimeChart
          v-if="activityChart"
          :times="activityChart.times"
          :series="activityChart.series"
          :bucket="activityChart.bucket"
          label="Messages over time by level"
        />
        <p v-else class="py-8 text-center text-sm text-muted">
          No messages in this period.
        </p>
      </section>

      <section v-if="data.stats?.total" class="mt-10">
        <h2 class="text-lg font-medium">
          Busiest channels this week
        </h2>
        <ul class="mt-4 divide-y divide-default rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
          <li v-for="c in data.channels" :key="c.channel">
            <NuxtLink :to="{ path: `${page}/logs`, query: { channel: c.channel } }" class="flex justify-between px-4 py-2.5 hover:bg-[var(--ui-bg-muted)]">
              <span class="log-line">{{ c.channel || '(no channel)' }}</span>
              <span class="tabular-nums text-muted">{{ fmt(c.n) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </PagePanel>
</template>
