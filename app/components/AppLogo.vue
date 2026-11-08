<script setup lang="ts">
defineProps<{ to?: string }>()
</script>

<template>
  <NuxtLink :to="to ?? '/'" class="inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" aria-label="LogsTrace home">
    <!-- Three log lines with a trace running through one value on each -->
    <svg width="24" height="22" viewBox="0 0 24 22" aria-hidden="true">
      <rect x="0" y="1.5" width="24" height="3" rx="1.5" fill="currentColor" opacity=".18" />
      <rect x="0" y="9.5" width="24" height="3" rx="1.5" fill="currentColor" opacity=".18" />
      <rect x="0" y="17.5" width="24" height="3" rx="1.5" fill="currentColor" opacity=".18" />
      <path d="M6 3 L17 11 L9 19" fill="none" stroke="var(--color-tide-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="6" cy="3" r="2.6" fill="var(--color-field-id)" />
      <circle cx="17" cy="11" r="2.6" fill="var(--color-field-number)" />
      <circle cx="9" cy="19" r="2.6" fill="var(--color-field-text)" />
    </svg>
    <span class="text-[1.05rem] font-semibold tracking-[-0.015em]">LogsTrace<span class="font-normal opacity-55">.dev</span></span>
  </NuxtLink>
</template>
