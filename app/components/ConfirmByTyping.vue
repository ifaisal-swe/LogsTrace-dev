<script setup lang="ts">
// Destructive actions ask people to type the name, so a mis-click can't delete anything
const props = defineProps<{ phrase: string, action: string, loading?: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })
const typed = ref('')
watch(open, () => { typed.value = '' })
</script>

<template>
  <UModal v-model:open="open" :title="action">
    <template #body>
      <p class="text-muted">
        This can't be undone. Type <span class="log-line font-medium text-default">{{ props.phrase }}</span> to confirm.
      </p>
      <UInput v-model="typed" class="mt-4 w-full" :placeholder="props.phrase" autofocus />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancel
        </UButton>
        <UButton color="error" :disabled="typed !== props.phrase" :loading="loading" @click="emit('confirm')">
          {{ action }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
