<script setup lang="ts">
import type { ChartSeries } from './TimeChart.vue'

type SummaryRes = { columns: { groups: string[], metrics: string[] }, rows: { groups: string[], metrics: (number | null)[] }[], masked: boolean }
type VolumeRes = { rows: { t: string | null, k: string, n: number }[], names: Record<string, string>, capped: boolean }
type LogItem = { id: number, ts: string, channel: string, level: string, text: string, templateId: string | null }

const props = defineProps<{
  panel: DashboardPanel
  api: string
  range: string
  tick: number
  templates: TemplateRow[]
}>()

const loading = ref(false)
const error = ref('')
const series = ref<{ times: string[], series: ChartSeries[], mode: 'stack' | 'line', bucket: Bucket } | null>(null)
const bars = ref<{ label: string, value: number, color?: string }[]>([])
const stat = ref<{ value: number | null, spark: number[] } | null>(null)
const table = ref<SummaryRes | null>(null)
const logs = ref<LogItem[]>([])
const masked = ref(false)

const template = computed(() => props.panel.source.kind === 'table' ? props.templates.find(t => t.id === (props.panel.source as { templateId: string }).templateId) : undefined)
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
const height = computed(() => PANEL_HEIGHT[props.panel.h])


// Volume keys → series colours: levels keep their status colours, everything else takes categorical slots
function volumeSeries(rows: VolumeRes['rows'], names: Record<string, string>, split: string, times: string[]): ChartSeries[] {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.k, (totals.get(r.k) ?? 0) + r.n)
  const ranked = [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)!)
  const keep = split === 'level' ? ranked : ranked.slice(0, SERIES_COLORS.length)
  const index = new Map(times.map((t, i) => [new Date(t).getTime(), i]))
  const make = () => Array<number | null>(times.length).fill(0)
  const vals = new Map(keep.map(k => [k, make()]))
  const other = make()
  for (const r of rows) {
    const i = index.get(new Date(r.t ?? '').getTime())
    if (i === undefined) continue
    const list = vals.get(r.k) ?? other
    list[i] = (list[i] ?? 0) + r.n
  }
  const label = (k: string) => split === 'level' ? (LEVEL_SERIES[k]?.name ?? k) : split === 'table' ? (names[k] ?? (k ? 'Unnamed table' : 'No table')) : (k || '(no channel)')
  const out: ChartSeries[] = keep.map((k, i) => ({
    name: label(k),
    color: split === 'level' ? (LEVEL_SERIES[k]?.color ?? 'var(--chart-other)') : keep.length === 1 ? 'var(--chart-single)' : SERIES_COLORS[i]!,
    values: vals.get(k)!
  }))
  if (ranked.length > keep.length) out.push({ name: `Other (${ranked.length - keep.length})`, color: 'var(--chart-other)', values: other })
  return out
}

async function load() {
  const p = props.panel
  const s = p.source
  loading.value = true
  error.value = ''
  try {
    const bucket = autoBucket(props.range)
    const { from, span } = rangeWindow(props.range, bucket)

    if (s.kind === 'logs') {
      const res = await $fetch<{ items: LogItem[], masked: boolean }>(`${props.api}/logs`, {
        query: { q: s.q || undefined, channel: s.channel || undefined, level: s.level, template: s.template, from, limit: p.h === 'l' ? 30 : p.h === 'm' ? 15 : 6 }
      })
      logs.value = res.items
      masked.value = res.masked
      return
    }

    if (s.kind === 'volume') {
      const base = { from, split: p.type === 'stat' ? 'none' : s.split, channel: s.channel || undefined, level: s.level }
      if (p.type === 'timeseries' || p.type === 'stat') {
        const res = await $fetch<VolumeRes>(`${props.api}/volume`, { method: 'POST', body: { ...base, bucket } })
        const times = fillTimes([...res.rows.map(r => r.t ?? ''), ...span].filter(Boolean), bucket)
        const list = volumeSeries(res.rows, res.names, base.split, times)
        if (p.type === 'stat') {
          const spark = times.map((_, i) => list.reduce((sum, x) => sum + (x.values[i] ?? 0), 0))
          stat.value = { value: spark.reduce((a, b) => a + b, 0), spark }
        } else {
          series.value = { times, series: list, mode: 'stack', bucket }
        }
      } else {
        const res = await $fetch<VolumeRes>(`${props.api}/volume`, { method: 'POST', body: { ...base, bucket: null } })
        bars.value = res.rows.slice(0, p.h === 'l' ? 15 : p.h === 'm' ? 8 : 4).map(r => ({
          label: base.split === 'level' ? (LEVEL_SERIES[r.k]?.name ?? r.k) : base.split === 'table' ? (res.names[r.k] ?? 'Unnamed table') : (r.k || '(no channel)'),
          value: r.n,
          color: base.split === 'level' ? LEVEL_SERIES[r.k]?.color : undefined
        }))
      }
      return
    }

    // Table source: everything goes through the regular query endpoint, so masking applies
    const url = `${props.api}/templates/${s.templateId}/query`
    const common = { from, filters: s.filters, mode: 'summary', metrics: [s.metric] }
    const label = metricLabel(s.metric, template.value)
    if (p.type === 'timeseries') {
      const res = await $fetch<SummaryRes>(url, { method: 'POST', body: { ...common, bucket, groupBy: s.groupBy === null ? [] : [s.groupBy], sort: { by: 'g0', dir: 'asc' } } })
      masked.value = res.masked
      const built = summaryToSeries(res.rows, bucket, s.metric.fn, label, span)
      series.value = { times: built.times, series: built.series, mode: built.mode, bucket }
    } else if (p.type === 'stat') {
      const [total, trend] = await Promise.all([
        $fetch<SummaryRes>(url, { method: 'POST', body: { ...common, bucket: null, groupBy: [] } }),
        $fetch<SummaryRes>(url, { method: 'POST', body: { ...common, bucket, groupBy: [], sort: { by: 'g0', dir: 'asc' } } })
      ])
      masked.value = total.masked
      const built = summaryToSeries(trend.rows, bucket, s.metric.fn, label, span)
      stat.value = { value: total.rows[0]?.metrics[0] ?? null, spark: (built.series[0]?.values ?? []).map(v => v ?? 0) }
    } else {
      const res = await $fetch<SummaryRes>(url, { method: 'POST', body: { ...common, bucket: null, groupBy: s.groupBy === null ? [] : [s.groupBy], sort: { by: 'm0', dir: 'desc' } } })
      masked.value = res.masked
      if (p.type === 'bars') bars.value = res.rows.slice(0, p.h === 'l' ? 15 : p.h === 'm' ? 8 : 4).map(r => ({ label: r.groups[0] ?? '', value: r.metrics[0] ?? 0 }))
      else table.value = res
    }
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}

watch(() => [JSON.stringify(props.panel.source), props.panel.type, props.panel.h, props.range, props.tick], load, { immediate: true })

const statFormat = computed(() => {
  const v = stat.value?.value
  if (v === null || v === undefined) return '—'
  return Math.abs(v) >= 100_000 ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v) : fmt(v)
})
</script>

<template>
  <div class="flex h-full flex-col" :class="{ 'opacity-60': loading }">
    <p v-if="error" class="py-6 text-center text-sm text-error">
      {{ error }}
    </p>
    <template v-else-if="panel.type === 'timeseries'">
      <TimeChart
        v-if="series && series.times.length"
        :times="series.times"
        :series="series.series"
        :mode="series.mode"
        :bucket="series.bucket"
        :height="height"
        :label="panel.title || 'Time series'"
        :format="fmt"
      />
      <p v-else-if="!loading" class="py-8 text-center text-sm text-muted">
        No data in this range.
      </p>
    </template>
    <template v-else-if="panel.type === 'stat'">
      <div v-if="stat" class="flex flex-1 flex-col justify-end gap-3">
        <p class="text-4xl font-semibold tabular-nums tracking-tight">
          {{ statFormat }}
        </p>
        <MiniBars v-if="stat.spark.length > 1" :values="stat.spark" :height="32" :label="`${panel.title} over the selected range`" />
      </div>
    </template>
    <template v-else-if="panel.type === 'bars'">
      <BarList v-if="bars.length" :items="bars" :format="fmt" />
      <p v-else-if="!loading" class="py-8 text-center text-sm text-muted">
        No data in this range.
      </p>
    </template>
    <template v-else-if="panel.type === 'table' && table">
      <div class="overflow-auto" :style="{ maxHeight: `${height + 40}px` }">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-default text-muted">
              <th v-for="g in table.columns.groups" :key="g" class="py-1.5 pe-3 font-normal">
                {{ g }}
              </th>
              <th class="py-1.5 text-end font-normal">
                {{ table.columns.metrics[0] }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in table.rows.slice(0, 100)" :key="i" class="border-b border-default/60 last:border-0">
              <td v-for="(g, gi) in r.groups" :key="gi" class="log-line py-1.5 pe-3">
                {{ g || '(empty)' }}
              </td>
              <td class="py-1.5 text-end tabular-nums">
                {{ r.metrics[0] === null ? '—' : fmt(r.metrics[0]!) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template v-else-if="panel.type === 'logs'">
      <ol v-if="logs.length" class="divide-y divide-default overflow-auto" :style="{ maxHeight: `${height + 40}px` }">
        <li v-for="e in logs" :key="e.id" class="grid grid-cols-[auto_1fr] gap-x-3 py-1.5 text-sm">
          <span class="flex items-center gap-2 tabular-nums text-muted">
            <UBadge :color="LEVEL_BADGE[e.level as LogLevel] ?? 'neutral'" variant="subtle" size="sm">{{ e.level }}</UBadge>
            {{ new Date(e.ts).toLocaleTimeString() }}
          </span>
          <LogText :text="e.text" inline class="log-line truncate text-[0.8rem]" :title="e.text" />
        </li>
      </ol>
      <p v-else-if="!loading" class="py-8 text-center text-sm text-muted">
        No messages in this range.
      </p>
    </template>
    <p v-if="masked && panel.type !== 'stat'" class="mt-2 text-xs text-muted">
      IPs, emails and tokens are hidden for your role.
    </p>
  </div>
</template>
