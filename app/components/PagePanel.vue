<script setup lang="ts">
// logData: the page shows log messages or counts, so it gets the storage badge
defineProps<{ title: string, description?: string, logData?: boolean }>()
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <LogSourceBadge v-if="logData" />
          <slot name="actions" />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <p v-if="description" class="mb-6 max-w-[70ch] text-muted">
          {{ description }}
        </p>
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
