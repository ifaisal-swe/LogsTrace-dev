<script setup lang="ts">
const props = defineProps<{ status: TicketStatus, staff?: boolean }>()
const COLORS = { open: 'warning', waiting: 'info', resolved: 'success', closed: 'neutral' } as const
const text = computed(() => (props.staff ? TICKET_STAFF_STATUS_LABELS : TICKET_STATUS_LABELS)[props.status])
</script>

<template>
  <UBadge :color="COLORS[status]" variant="subtle">
    {{ text }}
  </UBadge>
</template>
