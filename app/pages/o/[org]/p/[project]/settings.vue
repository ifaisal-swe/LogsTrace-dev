<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Project settings · LogsTrace' })

const { org, project, api } = useProjectPath()
const { refresh: refreshOrg, can } = useOrgContext()
const notify = useNotify()
const { data } = await useFetch<ProjectOverview>(() => api.value)

const state = reactive<{ name: string, retentionDays: number | null }>({ name: '', retentionDays: null })
watch(data, (d) => { if (d) { state.name = d.project.name; state.retentionDays = d.project.retentionDays ?? null } }, { immediate: true })
const retentionItems = [
  { label: 'Keep forever', value: null },
  ...[7, 15, 30, 90, 180, 365].map(d => ({ label: `${d} days`, value: d }))
]

// Delete messages by age, table and/or channel
const { data: templates } = await useFetch<TemplateRow[]>(() => `${api.value}/templates`, { default: () => [] })
const purge = reactive<{ before: string, templateId: string | undefined, channel: string }>({ before: '', templateId: undefined, channel: '' })
const purgeOpen = ref(false)
const purging = ref(false)
const purgeTables = computed(() => [{ label: 'Any table', value: undefined }, ...(templates.value ?? []).map(t => ({ label: t.name || t.pattern.slice(0, 60), value: t.id }))])
async function runPurge() {
  purging.value = true
  try {
    const res = await $fetch<{ removed: number, more: boolean }>(`${api.value}/logs/purge`, {
      method: 'POST',
      body: { before: purge.before ? new Date(purge.before).toISOString() : undefined, templateId: purge.templateId, channel: purge.channel.trim() || undefined, confirm: project.value }
    })
    purgeOpen.value = false
    notify.success(`Deleted ${res.removed.toLocaleString()} messages`, res.more ? 'More match; run it again to continue.' : undefined)
  } catch (err) { notify.error(err) } finally { purging.value = false }
}
const saving = ref(false)

async function save(e: FormSubmitEvent<z.infer<typeof projectSettingsSchema>>) {
  saving.value = true
  try {
    await $fetch<ProjectRow>(api.value, { method: 'PATCH', body: e.data })
    await refreshOrg()
    notify.success('Project saved')
  } catch (err) { notify.error(err) } finally { saving.value = false }
}

const confirmOpen = ref(false)
const deleting = ref(false)
async function remove() {
  deleting.value = true
  try {
    await $fetch(api.value, { method: 'DELETE', body: { confirm: project.value } })
    await refreshOrg()
    notify.success('Project deleted')
    await navigateTo(`/o/${org.value}`)
  } catch (err) { notify.error(err) } finally { deleting.value = false }
}
</script>

<template>
  <PagePanel title="Project settings">
    <UAlert v-if="!can('projects:manage')" color="neutral" variant="subtle" title="Only owners and admins can change project settings." />
    <template v-else>
      <UForm :schema="projectSettingsSchema" :state="state" class="flex max-w-md flex-col gap-4" @submit="save">
        <UFormField label="Name" name="name">
          <UInput v-model="state.name" class="w-full" />
        </UFormField>
        <UFormField label="Keep messages for" name="retentionDays" help="Older messages are deleted automatically every hour. Tables and dashboards stay.">
          <USelect v-model="state.retentionDays" :items="retentionItems" class="w-full" />
        </UFormField>
        <div>
          <UButton type="submit" :loading="saving">
            Save changes
          </UButton>
        </div>
      </UForm>

      <section class="mt-14 max-w-xl rounded-lg border border-[var(--ui-error)]/40 p-5">
        <h2 class="font-medium">
          Delete messages
        </h2>
        <p class="mt-1 text-sm text-muted">
          Removes stored messages for good. Tables, dashboards and keys stay. To remove a table itself, use the delete button on its page.
        </p>
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <UFormField label="Older than">
            <UInput v-model="purge.before" type="datetime-local" class="w-56" />
          </UFormField>
          <UFormField label="From table">
            <USelectMenu v-model="purge.templateId" :items="purgeTables" value-key="value" class="w-60" placeholder="Any table" />
          </UFormField>
          <UFormField label="From channel">
            <UInput v-model="purge.channel" placeholder="Any channel" class="w-44" maxlength="100" />
          </UFormField>
          <UButton color="error" variant="outline" :disabled="!purge.before && !purge.templateId && !purge.channel.trim()" @click="purgeOpen = true">
            Delete messages
          </UButton>
        </div>
      </section>
      <ConfirmByTyping v-model:open="purgeOpen" :phrase="project" action="Delete messages" :loading="purging" @confirm="runPurge" />

      <section class="mt-6 max-w-xl rounded-lg border border-[var(--ui-error)]/40 p-5">
        <h2 class="font-medium">
          Delete project
        </h2>
        <p class="mt-1 text-sm text-muted">
          Deletes its logs, tables and API keys. Systems using its keys will be rejected.
        </p>
        <UButton class="mt-4" color="error" variant="outline" @click="confirmOpen = true">
          Delete project
        </UButton>
      </section>
      <ConfirmByTyping v-model:open="confirmOpen" :phrase="project" action="Delete project" :loading="deleting" @confirm="remove" />
    </template>
  </PagePanel>
</template>
