<script setup lang="ts">
import { encode } from 'uqr'

// Renders a QR code as SVG rects (no v-html): one path with a square per dark module
const props = defineProps<{ value: string, size?: number, label: string }>()
const qr = computed(() => encode(props.value, { border: 2 }))
const path = computed(() => {
  let d = ''
  qr.value.data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x},${y}h1v1h-1z` }))
  return d
})
</script>

<template>
  <svg :viewBox="`0 0 ${qr.size} ${qr.size}`" :width="size ?? 180" :height="size ?? 180" role="img" :aria-label="label" shape-rendering="crispEdges" class="rounded-md bg-white">
    <rect :width="qr.size" :height="qr.size" fill="#ffffff" />
    <path :d="path" fill="#15211f" />
  </svg>
</template>
