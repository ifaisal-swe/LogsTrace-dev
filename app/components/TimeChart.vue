<script setup lang="ts">
export type ChartSeries = { name: string, color: string, values: (number | null)[] }

const props = withDefaults(defineProps<{
  times: string[]
  series: ChartSeries[]
  // stack: counts and sums that add up; line: averages, minimums and the like
  mode?: 'stack' | 'line'
  bucket?: string | null
  height?: number
  label: string
  format?: (n: number) => string
}>(), { mode: 'stack', bucket: 'hour', height: 220, format: (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 }) })

const M = { top: 10, right: 12, bottom: 26, left: 52 }
const root = ref<HTMLElement | null>(null)
const width = ref(640)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!root.value) return
  width.value = root.value.clientWidth || 640
  observer = new ResizeObserver(([entry]) => { if (entry) width.value = Math.max(240, entry.contentRect.width) })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const plotW = computed(() => Math.max(1, width.value - M.left - M.right))
const plotH = computed(() => props.height - M.top - M.bottom)
const band = computed(() => plotW.value / Math.max(1, props.times.length))

function niceStep(span: number) {
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  return ([1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)) ?? mag * 10
}

const domain = computed(() => {
  let lo = 0
  let hi = 0
  props.times.forEach((_, i) => {
    if (props.mode === 'stack') {
      hi = Math.max(hi, props.series.reduce((s, x) => s + Math.max(0, x.values[i] ?? 0), 0))
    } else {
      for (const s of props.series) {
        const v = s.values[i]
        if (v === null || v === undefined) continue
        hi = Math.max(hi, v)
        lo = Math.min(lo, v)
      }
    }
  })
  // Counts never need a 0.5 tick
  const whole = props.series.every(s => s.values.every(v => v === null || Number.isInteger(v)))
  const step = whole ? Math.max(1, niceStep(hi - lo || 1)) : niceStep(hi - lo || 1)
  return { lo: Math.floor(lo / step) * step, hi: Math.max(step, Math.ceil(hi / step) * step), step }
})
const y = (v: number) => M.top + plotH.value - ((v - domain.value.lo) / (domain.value.hi - domain.value.lo)) * plotH.value
const ticks = computed(() => {
  const out: number[] = []
  for (let v = domain.value.lo; v <= domain.value.hi + 1e-9; v += domain.value.step) out.push(v)
  return out
})

const fmtTime = (iso: string, long = false) => {
  const d = new Date(iso)
  if (props.bucket === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  if (props.bucket === 'day' || props.bucket === 'week') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(long ? { year: 'numeric' } : {}) })
  return long
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
const xTicks = computed(() => {
  const n = props.times.length
  if (!n) return []
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW.value / 90))))
  return props.times.map((t, i) => ({ i, t })).filter(({ i }) => i % every === 0)
})

const bars = computed(() => {
  if (props.mode !== 'stack') return []
  const w = Math.min(40, Math.max(1, band.value - (band.value > 4 ? 2 : 0)))
  const out: { key: string, x: number, y: number, w: number, h: number, color: string }[] = []
  props.times.forEach((_, i) => {
    let acc = 0
    props.series.forEach((s, si) => {
      const v = Math.max(0, s.values[i] ?? 0)
      if (!v) return
      const top = y(acc + v)
      const bottom = y(acc)
      // 1px surface gap between stacked segments
      const h = Math.max(1, bottom - top - (acc > 0 ? 1 : 0))
      out.push({ key: `${i}-${si}`, x: M.left + i * band.value + (band.value - w) / 2, y: top, w, h, color: s.color })
      acc += v
    })
  })
  return out
})

const lines = computed(() => {
  if (props.mode !== 'line') return []
  return props.series.map((s) => {
    const segments: string[] = []
    // A point with no neighbours draws no line, so it gets a dot
    const dots: { x: number, y: number }[] = []
    let cur: { x: number, y: number }[] = []
    const flush = () => {
      if (cur.length === 1) dots.push(cur[0]!)
      else if (cur.length) segments.push(cur.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))
      cur = []
    }
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) return flush()
      cur.push({ x: M.left + (i + 0.5) * band.value, y: y(v) })
    })
    flush()
    return { name: s.name, color: s.color, segments, dots }
  })
})

const active = ref<number | null>(null)
function onMove(e: PointerEvent) {
  const box = (e.currentTarget as SVGElement).getBoundingClientRect()
  const i = Math.floor((e.clientX - box.left - M.left) / band.value)
  active.value = i >= 0 && i < props.times.length ? i : null
}
function onKey(e: KeyboardEvent) {
  if (!props.times.length) return
  if (e.key === 'ArrowRight') active.value = Math.min(props.times.length - 1, (active.value ?? -1) + 1)
  else if (e.key === 'ArrowLeft') active.value = Math.max(0, (active.value ?? props.times.length) - 1)
  else if (e.key === 'Escape') active.value = null
  else return
  e.preventDefault()
}
const tip = computed(() => {
  const i = active.value
  if (i === null) return null
  const rows = props.series.map(s => ({ name: s.name, color: s.color, value: s.values[i] ?? null }))
  const total = props.mode === 'stack' && rows.length > 1 ? rows.reduce((s, r) => s + (r.value ?? 0), 0) : null
  const x = M.left + (i + 0.5) * band.value
  return { time: fmtTime(props.times[i]!, true), rows, total, x, flip: x > width.value * 0.6 }
})
</script>

<template>
  <figure ref="root" class="relative">
    <ul v-if="series.length > 1" class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <li v-for="s in series" :key="s.name" class="flex items-center gap-1.5">
        <span v-if="mode === 'stack'" class="inline-block size-2.5 rounded-[2px]" :style="{ background: s.color }" />
        <span v-else class="inline-block h-0.5 w-3.5 rounded" :style="{ background: s.color }" />
        <span class="log-line">{{ s.name }}</span>
      </li>
    </ul>
    <svg
      :width="width"
      :height="height"
      class="block max-w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
      role="img"
      :aria-label="label"
      tabindex="0"
      @pointermove="onMove"
      @pointerleave="active = null"
      @keydown="onKey"
      @blur="active = null"
    >
      <g class="text-[11px]" fill="var(--ui-text-muted)">
        <template v-for="t in ticks" :key="t">
          <line :x1="M.left" :x2="width - M.right" :y1="y(t)" :y2="y(t)" stroke="var(--chart-grid)" :stroke-dasharray="t === 0 ? undefined : '2 3'" />
          <text :x="M.left - 8" :y="y(t)" text-anchor="end" dominant-baseline="middle" class="tabular-nums">{{ format(t) }}</text>
        </template>
        <text v-for="xt in xTicks" :key="xt.i" :x="M.left + (xt.i + 0.5) * band" :y="height - 8" text-anchor="middle">{{ fmtTime(xt.t) }}</text>
      </g>
      <rect v-for="b in bars" :key="b.key" :x="b.x" :y="b.y" :width="b.w" :height="b.h" :fill="b.color" rx="1.5" />
      <g v-for="l in lines" :key="l.name">
        <polyline v-for="(pts, i) in l.segments" :key="i" :points="pts" fill="none" :stroke="l.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle v-for="(d, i) in l.dots" :key="`d${i}`" :cx="d.x" :cy="d.y" r="3.5" :fill="l.color" />
      </g>
      <template v-if="tip">
        <line :x1="tip.x" :x2="tip.x" :y1="M.top" :y2="M.top + plotH" stroke="var(--ui-text-muted)" stroke-width="1" />
        <template v-if="mode === 'line'">
          <template v-for="s in series" :key="s.name">
            <circle v-if="s.values[active!] !== null && s.values[active!] !== undefined" :cx="tip.x" :cy="y(s.values[active!]!)" r="4" :fill="s.color" stroke="var(--ui-bg-elevated)" stroke-width="2" />
          </template>
        </template>
      </template>
    </svg>
    <div
      v-if="tip"
      class="pointer-events-none absolute top-8 z-10 min-w-36 rounded-md border border-default bg-[var(--ui-bg-elevated)] px-3 py-2 text-sm shadow-md"
      :style="tip.flip ? { right: `${width - tip.x + 10}px` } : { left: `${tip.x + 10}px` }"
    >
      <p class="text-muted">
        {{ tip.time }}
      </p>
      <p v-for="r in tip.rows" :key="r.name" class="mt-1 flex items-center gap-2">
        <span class="inline-block h-0.5 w-3 rounded" :style="{ background: r.color }" />
        <span class="font-semibold tabular-nums">{{ r.value === null ? '—' : format(r.value) }}</span>
        <span class="log-line truncate text-muted">{{ r.name }}</span>
      </p>
      <p v-if="tip.total !== null" class="mt-1 border-t border-default pt-1 text-muted">
        Total <span class="font-semibold tabular-nums text-default">{{ format(tip.total) }}</span>
      </p>
    </div>
  </figure>
</template>
