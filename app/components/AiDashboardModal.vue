<script setup lang="ts">
const props = defineProps<{ api: string, existing?: string[], busy?: boolean }>()
const emit = defineEmits<{ use: [draft: AiDashboardDraft] }>()
const open = defineModel<boolean>('open', { default: false })

const EXAMPLES = [
  'Error rate and the noisiest tables, plus the latest failures',
  'Sign-ins: how many per hour, failures, and the most active accounts',
  'Response times: average and slowest per hour, and slow requests'
]
const adding = computed(() => !!props.existing)
const request = ref('')
const draft = ref<AiDashboardDraft | null>(null)
const loading = ref(false)
const errorMsg = ref('')

async function generate() {
  loading.value = true
  errorMsg.value = ''
  try {
    draft.value = await $fetch<AiDashboardDraft>(`${props.api}/ai/dashboard`, { method: 'POST', body: { request: request.value, existing: props.existing ?? [] } })
  } catch (err) {
    errorMsg.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}

watch(open, (o) => { if (!o) { draft.value = null; errorMsg.value = '' } })
const typeIcon = (t: PanelType) => PANEL_TYPES.find(x => x.value === t)?.icon ?? 'i-lucide-square'
</script>

<template>
  <UModal v-model:open="open" :title="adding ? 'Add panels with AI' : 'Build a dashboard with AI'" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <form class="flex flex-col gap-3" @submit.prevent="generate">
        <UFormField label="What do you need to see?" help="Describe the questions this dashboard should answer. The AI sees your table names and columns, never full logs.">
          <UTextarea v-model="request" :rows="3" autoresize maxlength="1000" class="w-full" autofocus />
        </UFormField>
        <div v-if="!draft" class="flex flex-wrap gap-2">
          <UButton v-for="e in EXAMPLES" :key="e" size="xs" color="neutral" variant="soft" class="max-w-full" @click="request = e">
            <span class="truncate">{{ e }}</span>
          </UButton>
        </div>
        <UButton type="submit" icon="i-lucide-sparkles" :loading="loading" :disabled="request.trim().length < 3" class="self-start" :variant="draft ? 'outline' : 'solid'">
          {{ draft ? 'Try again' : 'Suggest panels' }}
        </UButton>
      </form>

      <UAlert v-if="errorMsg" class="mt-4" color="error" variant="subtle" :title="errorMsg" />

      <section v-if="draft" class="mt-5">
        <template v-if="!adding">
          <p class="font-medium">
            {{ draft.name }}
          </p>
          <p v-if="draft.description" class="text-sm text-muted">
            {{ draft.description }}
          </p>
        </template>
        <ul class="mt-3 divide-y divide-default rounded-lg border border-default">
          <li v-for="p in draft.panels" :key="p.id" class="flex items-center gap-3 px-3 py-2">
            <UIcon :name="typeIcon(p.type)" class="size-4 shrink-0 text-muted" />
            <span class="min-w-0 flex-1 truncate">{{ p.title }}</span>
            <span class="text-xs text-muted">{{ WIDTHS.find(w => w.value === p.w)?.label }}</span>
          </li>
        </ul>
        <UAlert v-if="draft.notes" class="mt-3" color="neutral" variant="subtle" icon="i-lucide-info" :title="draft.notes" />
      </section>
    </template>
    <template v-if="draft" #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancel
        </UButton>
        <UButton :loading="busy" icon="i-lucide-check" @click="emit('use', draft)">
          {{ adding ? `Add ${draft.panels.length} panels` : 'Create dashboard' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
