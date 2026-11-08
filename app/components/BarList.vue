<script setup lang="ts">
// Ranked horizontal bars; labels and values stay in text colours, the bar carries the magnitude
const props = defineProps<{
  items: { label: string, value: number, color?: string }[]
  format?: (n: number) => string
}>()
const max = computed(() => Math.max(1, ...props.items.map(i => Math.abs(i.value))))
const fmt = (n: number) => props.format ? props.format(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
</script>

<template>
  <ul class="flex flex-col gap-2">
    <li v-for="(it, i) in items" :key="i" class="text-sm" :title="`${it.label}: ${fmt(it.value)}`">
      <div class="flex items-baseline justify-between gap-3">
        <span class="log-line truncate">{{ it.label || '(empty)' }}</span>
        <span class="shrink-0 font-medium tabular-nums">{{ fmt(it.value) }}</span>
      </div>
      <div class="mt-1 h-1.5 rounded-sm bg-[var(--ui-bg-muted)]">
        <div class="h-1.5 rounded-sm" :style="{ width: `${Math.max(1.5, Math.abs(it.value) / max * 100)}%`, background: it.color ?? 'var(--chart-single)' }" />
      </div>
    </li>
  </ul>
</template>
