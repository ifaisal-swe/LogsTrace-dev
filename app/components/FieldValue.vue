<script setup lang="ts">
defineProps<{ type: 'number' | 'id' | 'text', value: string }>()
</script>

<template>
  <span class="log-line" :class="`field-${type}`">{{ value || '—' }}</span>
</template>
