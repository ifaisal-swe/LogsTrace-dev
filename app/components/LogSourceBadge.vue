<script setup lang="ts">
// Tells platform admins that a page's log data comes from ClickHouse; customers don't see storage details
const { user } = useAuth()
</script>

<template>
  <UTooltip v-if="user?.platformRole === 'admin'" text="Log data on this page is read from ClickHouse">
    <UBadge color="neutral" variant="subtle" size="sm" icon="i-lucide-database" class="font-mono">
      ClickHouse
    </UBadge>
  </UTooltip>
</template>
