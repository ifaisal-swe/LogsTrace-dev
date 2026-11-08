<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'API keys · LogsTrace' })

const { api } = useProjectPath()
const { can } = useOrgContext()
const notify = useNotify()
const { data: keys, refresh, error } = await useFetch<ApiKeyRow[]>(() => `${api.value}/keys`)

const state = reactive<{ name: string, access: 'send' | 'read' | 'both', readSensitive: boolean }>({ name: '', access: 'send', readSensitive: false })
const accessItems = [
  { label: 'Send logs', value: 'send', description: 'For servers and apps. Can only write.' },
  { label: 'Read logs', value: 'read', description: 'For scripts, tools and AI assistants (MCP) that query logs.' },
  { label: 'Send and read', value: 'both' }
]
const accessLabel = (scopes: string[]) => scopes.includes('read') ? (scopes.includes('ingest') ? 'Send + read' : 'Read') : 'Send'
const creating = ref(false)
const newKey = ref('')
const newKeyReads = ref(false)
const { mcp } = useAi()
const mcpConfig = computed(() => JSON.stringify({
  mcpServers: { logstrace: { url: `${window.location.origin}/api/mcp`, headers: { Authorization: `Bearer ${newKey.value}` } } }
}, null, 2))

async function create(e: FormSubmitEvent<z.infer<typeof apiKeySchema>>) {
  creating.value = true
  try {
    const res = await $fetch<{ id: string, key: string }>(`${api.value}/keys`, { method: 'POST', body: e.data })
    newKey.value = res.key
    newKeyReads.value = e.data.access !== 'send'
    state.name = ''
    state.readSensitive = false
    await refresh()
  } catch (err) { notify.error(err) } finally { creating.value = false }
}

async function revoke(id: string) {
  try {
    await $fetch(`${api.value}/keys/${id}`, { method: 'DELETE' })
    notify.success('Key revoked', 'Requests using it stop working within a minute.')
    await refresh()
  } catch (err) { notify.error(err) }
}

async function copy(text = newKey.value, what = 'Key') {
  await navigator.clipboard.writeText(text)
  notify.success(`${what} copied`)
}
</script>

<template>
  <PagePanel title="API keys" description="Systems send logs to this project with a key. Give each server or app its own, so you can revoke one without touching the others.">
    <UAlert v-if="error" color="neutral" variant="subtle" :title="apiErrorMessage(error)" />
    <template v-else>
      <UForm :schema="apiKeySchema" :state="state" class="flex max-w-lg flex-wrap items-end gap-3" @submit="create">
        <UFormField label="Key name" name="name" class="min-w-56 flex-1">
          <UInput v-model="state.name" placeholder="Production server" class="w-full" />
        </UFormField>
        <UFormField label="Access" name="access" class="w-44">
          <USelect v-model="state.access" :items="accessItems" class="w-full" />
        </UFormField>
        <UCheckbox
          v-if="state.access !== 'send' && can('logs:read_sensitive')"
          v-model="state.readSensitive"
          label="Show IPs, emails and tokens"
          description="Off: the key reads masked text, like a viewer."
          class="basis-full"
        />
        <UButton type="submit" :loading="creating">
          Create key
        </UButton>
      </UForm>

      <div v-if="newKey" class="mt-6 rounded-lg border border-[var(--color-tide-400)] bg-[var(--color-tide-50)] p-4 dark:bg-[var(--color-tide-950)]">
        <p class="font-medium">
          Copy this key now. It won't be shown again.
        </p>
        <div class="mt-2 flex items-center gap-2">
          <code class="log-line min-w-0 flex-1 truncate text-sm">{{ newKey }}</code>
          <UButton icon="i-lucide-copy" color="neutral" variant="outline" size="sm" aria-label="Copy key" @click="copy()" />
        </div>
        <details v-if="newKeyReads && mcp" class="mt-4">
          <summary class="cursor-pointer text-sm font-medium">
            Connect an AI assistant (MCP)
          </summary>
          <p class="mt-2 text-sm text-muted">
            Add this to your MCP client (Claude, Cursor, VS Code…). The assistant can only read this project, with this key's masking. Log text reaches the assistant's provider.
          </p>
          <div class="mt-2 flex items-start gap-2">
            <pre class="log-line min-w-0 flex-1 overflow-x-auto rounded-md border border-default bg-[var(--ui-bg)] p-3 text-xs">{{ mcpConfig }}</pre>
            <UButton icon="i-lucide-copy" color="neutral" variant="outline" size="sm" aria-label="Copy MCP settings" @click="copy(mcpConfig, 'MCP settings')" />
          </div>
        </details>
      </div>

      <div class="mt-8 overflow-x-auto rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-default text-muted">
              <th class="px-4 py-2.5 font-normal">
                Name
              </th>
              <th class="px-4 py-2.5 font-normal">
                Key
              </th>
              <th class="px-4 py-2.5 font-normal">
                Access
              </th>
              <th class="px-4 py-2.5 font-normal">
                Last used
              </th>
              <th class="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-if="!keys?.length">
              <td colspan="5" class="px-4 py-6 text-center text-muted">
                No keys yet. Create one above to start sending logs.
              </td>
            </tr>
            <tr v-for="k in keys" :key="k.id" class="border-b border-default/70 last:border-0" :class="k.revokedAt ? 'opacity-55' : ''">
              <td class="px-4 py-3">
                <p class="font-medium">
                  {{ k.name }}
                </p>
                <p class="text-muted">
                  Created by {{ k.createdBy ?? 'a removed user' }}
                </p>
              </td>
              <td class="log-line px-4 py-3">
                {{ k.prefix }}…
              </td>
              <td class="px-4 py-3">
                {{ accessLabel(k.scopes) }}
                <span v-if="k.readSensitive" class="text-muted">· unmasked</span>
              </td>
              <td class="px-4 py-3 text-muted">
                {{ k.revokedAt ? 'Revoked' : k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never' }}
              </td>
              <td class="px-4 py-3 text-end">
                <UButton v-if="!k.revokedAt" color="error" variant="ghost" size="sm" @click="revoke(k.id)">
                  Revoke
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </PagePanel>
</template>
