<script setup lang="ts">
// Small bar strip for sparklines and histograms; each bar's <title> carries its value
const props = withDefaults(defineProps<{
  values: number[]
  titles?: string[]
  label: string
  height?: number
  color?: string
}>(), { height: 24, color: 'var(--chart-single)' })

const W = 100
const max = computed(() => Math.max(1, ...props.values))
const bw = computed(() => W / Math.max(1, props.values.length))
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" class="block w-full" :style="{ height: `${height}px` }" role="img" :aria-label="label">
    <line x1="0" :x2="W" :y1="height - 0.5" :y2="height - 0.5" stroke="var(--chart-grid)" stroke-width="1" vector-effect="non-scaling-stroke" />
    <rect
      v-for="(v, i) in values"
      :key="i"
      :x="i * bw + bw * 0.12"
      :y="v ? height - Math.max(1.5, (v / max) * height) : height"
      :width="bw * 0.76"
      :height="v ? Math.max(1.5, (v / max) * height) : 0"
      :fill="color"
    >
      <title>{{ titles?.[i] ?? v.toLocaleString() }}</title>
    </rect>
  </svg>
</template>
