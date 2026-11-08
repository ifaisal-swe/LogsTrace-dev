<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Organization settings · LogsTrace' })

const { slug, ctx, can } = useOrgContext()
const { refresh: refreshMe } = useAuth()
const notify = useNotify()

const state = reactive({ name: '' })
watch(ctx, (c) => { if (c) state.name = c.org.name }, { immediate: true })
const saving = ref(false)

async function save(e: FormSubmitEvent<z.infer<typeof orgSchema>>) {
  saving.value = true
  try {
    await $fetch(`/api/orgs/${slug.value}`, { method: 'PATCH', body: e.data })
    await refreshMe()
    notify.success('Organization saved')
  } catch (err) { notify.error(err) } finally { saving.value = false }
}

const confirmOpen = ref(false)
const deleting = ref(false)
async function remove() {
  deleting.value = true
  try {
    await $fetch(`/api/orgs/${slug.value}`, { method: 'DELETE', body: { confirm: slug.value } })
    await refreshMe()
    notify.success('Organization deleted')
    await navigateTo('/app')
  } catch (err) { notify.error(err) } finally { deleting.value = false }
}
</script>

<template>
  <PagePanel title="Organization settings">
    <UAlert v-if="ctx && !can('org:update')" color="neutral" variant="subtle" title="Only owners and admins can change these settings." />
    <template v-else>
      <UForm :schema="orgSchema" :state="state" class="flex max-w-md flex-col gap-4" @submit="save">
        <UFormField label="Name" name="name">
          <UInput v-model="state.name" class="w-full" />
        </UFormField>
        <div>
          <UButton type="submit" :loading="saving">
            Save changes
          </UButton>
        </div>
      </UForm>

      <section v-if="can('org:delete')" class="mt-14 max-w-xl rounded-lg border border-[var(--ui-error)]/40 p-5">
        <h2 class="font-medium">
          Delete organization
        </h2>
        <p class="mt-1 text-sm text-muted">
          Deletes every project, log, table and API key in it. Members lose access immediately.
        </p>
        <UButton class="mt-4" color="error" variant="outline" @click="confirmOpen = true">
          Delete organization
        </UButton>
      </section>
      <ConfirmByTyping v-model:open="confirmOpen" :phrase="slug" action="Delete organization" :loading="deleting" @confirm="remove" />
    </template>
  </PagePanel>
</template>
