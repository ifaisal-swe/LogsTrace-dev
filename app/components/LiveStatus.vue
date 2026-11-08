<script setup lang="ts">
const props = defineProps<{ status: LiveStatus, paused?: boolean }>()
const label = computed(() => {
  if (props.status === 'offline') return 'Not live, refresh to update'
  if (props.status === 'connecting') return 'Connecting'
  return props.paused ? 'Paused' : 'Live'
})
</script>

<template>
  <span class="inline-flex items-center gap-2 text-sm text-muted" role="status">
    <span
      class="size-2 rounded-full"
      :class="{
        'live-dot bg-[var(--color-tide-500)]': status === 'live' && !paused,
        'bg-[var(--color-field-number)]': status === 'live' && paused,
        'bg-[var(--color-moss-400)]': status !== 'live'
      }"
    />
    {{ label }}
  </span>
</template>

<style scoped>
.live-dot {
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-tide-500) 50%, transparent);
  animation: live-pulse 2s ease-out infinite;
}
@keyframes live-pulse {
  to { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
}
</style>
