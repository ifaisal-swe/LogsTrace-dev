<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Alerts · LogsTrace' })

type Condition =
  | { kind: 'level', minLevel: 'warn' | 'error' | 'fatal', channel?: string, templateId?: string }
  | { kind: 'new_table' }
  | { kind: 'text', contains: string, level?: LogLevel, channel?: string, templateId?: string }
  | { kind: 'volume', threshold: number, windowMinutes: number, level?: LogLevel, channel?: string, templateId?: string }
type Rule = { id: string, name: string, condition: Condition, destination: 'discord' | 'slack' | 'webhook', url: string, cooldownMinutes: number, enabled: boolean, lastFiredAt: string | null, lastError: string | null }

const { api } = useProjectPath()
const { can } = useOrgContext()
const notify = useNotify()
const { data: rules, refresh, error } = await useFetch<Rule[]>(() => `${api.value}/alerts`, { default: () => [] })
const { data: templates } = await useFetch<TemplateRow[]>(() => `${api.value}/templates`, { default: () => [] })

const KINDS = [
  { label: 'A message at or above a level', value: 'level' },
  { label: 'A message that contains some text', value: 'text' },
  { label: 'A new kind of message (new table)', value: 'new_table' },
  { label: 'Too many messages in a time window', value: 'volume' }
]
const DESTINATIONS = [
  { label: 'Discord', value: 'discord', icon: 'i-lucide-message-square' },
  { label: 'Slack', value: 'slack', icon: 'i-lucide-hash' },
  { label: 'Webhook (JSON)', value: 'webhook', icon: 'i-lucide-webhook' }
]
const minLevels = [{ label: 'Warning or worse', value: 'warn' }, { label: 'Error or worse', value: 'error' }, { label: 'Fatal only', value: 'fatal' }]
const anyLevel = [{ label: 'Any level', value: undefined }, ...[...LOG_LEVELS].reverse().map(l => ({ label: LEVEL_LABELS[l], value: l }))]
const tableItems = computed(() => [{ label: 'Any table', value: undefined }, ...(templates.value ?? []).map(t => ({ label: t.name || t.pattern.slice(0, 60), value: t.id }))])

const blank = () => ({
  name: '',
  kind: 'level' as Condition['kind'],
  minLevel: 'error' as 'warn' | 'error' | 'fatal',
  level: undefined as LogLevel | undefined,
  channel: '',
  contains: '',
  templateId: undefined as string | undefined,
  threshold: 100,
  windowMinutes: 5,
  destination: 'discord' as Rule['destination'],
  url: '',
  cooldownMinutes: 10
})
const form = reactive(blank())
const formOpen = ref(false)
const saving = ref(false)

function condition(): Condition {
  const channel = form.channel.trim() || undefined
  if (form.kind === 'new_table') return { kind: 'new_table' }
  if (form.kind === 'text') return { kind: 'text', contains: form.contains.trim(), level: form.level, channel, templateId: form.templateId }
  if (form.kind === 'level') return { kind: 'level', minLevel: form.minLevel, channel, templateId: form.templateId }
  return { kind: 'volume', threshold: form.threshold, windowMinutes: form.windowMinutes, level: form.level, channel, templateId: form.templateId }
}

async function create() {
  saving.value = true
  try {
    await $fetch(`${api.value}/alerts`, {
      method: 'POST',
      body: { name: form.name, condition: condition(), destination: form.destination, url: form.url, cooldownMinutes: form.cooldownMinutes }
    })
    notify.success('Alert created')
    Object.assign(form, blank())
    formOpen.value = false
    await refresh()
  } catch (err) { notify.error(err) } finally { saving.value = false }
}

async function toggle(r: Rule) {
  try {
    await $fetch(`${api.value}/alerts/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } })
    await refresh()
  } catch (err) { notify.error(err) }
}
const testing = ref<string | null>(null)
async function test(r: Rule) {
  testing.value = r.id
  try {
    await $fetch(`${api.value}/alerts/${r.id}/test`, { method: 'POST' })
    notify.success('Test sent', 'Check the channel or endpoint.')
  } catch (err) { notify.error(err) } finally {
    testing.value = null
    await refresh()
  }
}
async function remove(r: Rule) {
  try {
    await $fetch(`${api.value}/alerts/${r.id}`, { method: 'DELETE' })
    await refresh()
  } catch (err) { notify.error(err) }
}

function describe(c: Condition) {
  const where = (x: { channel?: string, templateId?: string }) => [
    x.channel ? `in #${x.channel}` : '',
    x.templateId ? `in ${templates.value?.find(t => t.id === x.templateId)?.name || 'one table'}` : ''
  ].filter(Boolean).join(' ')
  if (c.kind === 'new_table') return 'When a new kind of message appears'
  if (c.kind === 'text') return `When a ${c.level ? `${LEVEL_LABELS[c.level].toLowerCase()} ` : ''}message contains "${c.contains}" ${where(c)}`.trim()
  if (c.kind === 'level') return `When a ${LEVEL_LABELS[c.minLevel].toLowerCase()} or worse arrives ${where(c)}`.trim()
  return `When ${c.threshold.toLocaleString()}+ ${c.level ? `${LEVEL_LABELS[c.level].toLowerCase()} ` : ''}messages arrive within ${c.windowMinutes} min ${where(c)}`.trim()
}
const urlHelp = computed(() => ({
  discord: 'Channel settings → Integrations → Webhooks → Copy URL.',
  slack: 'An Incoming Webhook URL (hooks.slack.com/services/…).',
  webhook: 'Any public https endpoint. It receives a JSON POST.'
})[form.destination])
</script>

<template>
  <PagePanel title="Alerts" description="Get a message in Discord, Slack or your own endpoint when something happens in this project. Message text is always sent masked.">
    <template #actions>
      <UButton v-if="can('projects:manage')" icon="i-lucide-plus" size="sm" @click="formOpen = !formOpen">
        New alert
      </UButton>
    </template>
    <UAlert v-if="error" color="neutral" variant="subtle" :title="apiErrorMessage(error)" />
    <template v-else>
      <form v-if="formOpen" class="mb-8 grid gap-4 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-5 sm:grid-cols-2" @submit.prevent="create">
        <UFormField label="Name" class="sm:col-span-2">
          <UInput v-model="form.name" placeholder="Checkout errors" class="w-full" />
        </UFormField>
        <UFormField label="Alert me" class="sm:col-span-2">
          <USelect v-model="form.kind" :items="KINDS" class="w-full" />
        </UFormField>
        <template v-if="form.kind === 'level'">
          <UFormField label="Level">
            <USelect v-model="form.minLevel" :items="minLevels" class="w-full" />
          </UFormField>
        </template>
        <template v-if="form.kind === 'text'">
          <UFormField label="Contains" help="Case-insensitive. Matched on masked text.">
            <UInput v-model="form.contains" placeholder="timeout" class="w-full" />
          </UFormField>
          <UFormField label="Level">
            <USelect v-model="form.level" :items="anyLevel" placeholder="Any level" class="w-full" />
          </UFormField>
        </template>
        <template v-if="form.kind === 'volume'">
          <UFormField label="At least this many messages">
            <UInputNumber v-model="form.threshold" :min="1" class="w-full" />
          </UFormField>
          <UFormField label="Within (minutes)">
            <UInputNumber v-model="form.windowMinutes" :min="1" :max="1440" class="w-full" />
          </UFormField>
          <UFormField label="Level">
            <USelect v-model="form.level" :items="anyLevel" placeholder="Any level" class="w-full" />
          </UFormField>
        </template>
        <template v-if="form.kind !== 'new_table'">
          <UFormField label="Channel" help="Optional, exact match.">
            <UInput v-model="form.channel" icon="i-lucide-hash" class="w-full" />
          </UFormField>
          <UFormField label="Table">
            <USelectMenu v-model="form.templateId" :items="tableItems" value-key="value" placeholder="Any table" class="w-full" />
          </UFormField>
        </template>
        <UFormField label="Send to">
          <USelect v-model="form.destination" :items="DESTINATIONS" class="w-full" />
        </UFormField>
        <UFormField label="Quiet period (minutes)" help="After it fires, wait this long before firing again.">
          <UInputNumber v-model="form.cooldownMinutes" :min="1" :max="1440" class="w-full" />
        </UFormField>
        <UFormField label="Webhook URL" :help="urlHelp" class="sm:col-span-2">
          <UInput v-model="form.url" type="url" placeholder="https://…" class="w-full" autocomplete="off" />
        </UFormField>
        <div class="flex gap-2 sm:col-span-2">
          <UButton type="submit" :loading="saving" :disabled="form.name.trim().length < 2 || !form.url || (form.kind === 'text' && form.contains.trim().length < 2)">
            Create alert
          </UButton>
          <UButton color="neutral" variant="ghost" @click="formOpen = false">
            Cancel
          </UButton>
        </div>
      </form>

      <p v-if="!rules.length" class="py-10 text-center text-muted">
        No alerts yet.
      </p>
      <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
        <li v-for="r in rules" :key="r.id" class="flex flex-wrap items-center gap-4 px-4 py-3.5" :class="{ 'opacity-60': !r.enabled }">
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 font-medium">
              <UIcon :name="DESTINATIONS.find(d => d.value === r.destination)?.icon ?? 'i-lucide-bell'" class="size-4 text-muted" />
              {{ r.name }}
            </p>
            <p class="mt-0.5 text-sm text-muted">
              {{ describe(r.condition) }} · {{ r.url }}
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ r.lastFiredAt ? `Last fired ${new Date(r.lastFiredAt).toLocaleString()}` : 'Never fired' }} · quiet {{ r.cooldownMinutes }} min
            </p>
            <p v-if="r.lastError" class="mt-1 text-xs text-error">
              Last delivery failed: {{ r.lastError }}
            </p>
          </div>
          <USwitch :model-value="r.enabled" :aria-label="r.enabled ? 'Turn off' : 'Turn on'" @update:model-value="toggle(r)" />
          <UButton size="sm" color="neutral" variant="outline" :loading="testing === r.id" @click="test(r)">
            Send test
          </UButton>
          <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" aria-label="Delete alert" @click="remove(r)" />
        </li>
      </ul>
    </template>
  </PagePanel>
</template>
