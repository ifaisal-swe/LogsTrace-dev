<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { slug, ctx, refresh, can, error } = useOrgContext()
useSeoMeta({ title: () => `${ctx.value?.org.name ?? 'Organization'} · LogsTrace` })
const notify = useNotify()

const state = reactive({ name: '' })
const creating = ref(false)

async function create(e: FormSubmitEvent<z.infer<typeof projectSchema>>) {
  creating.value = true
  try {
    const p = await $fetch(`/api/orgs/${slug.value}/projects`, { method: 'POST', body: e.data })
    await refresh()
    notify.success('Project created', 'Next, create an API key and send your first message.')
    await navigateTo(`/o/${slug.value}/p/${p?.slug ?? ''}`)
  } catch (err) { notify.error(err) } finally { creating.value = false }
}
</script>

<template>
  <PagePanel :title="ctx?.org.name ?? 'Organization'" description="Each project has its own logs, tables and API keys. Use one per server or app.">
    <UAlert v-if="error" color="error" variant="subtle" title="This organization doesn't exist or you're not a member." />
    <template v-else>
      <ul v-if="ctx?.projects.length" class="grid gap-3 sm:grid-cols-2">
        <li v-for="p in ctx.projects" :key="p.id">
          <NuxtLink :to="`/o/${slug}/p/${p.slug}`" class="block rounded-lg border border-default bg-[var(--ui-bg-elevated)] px-5 py-4 hover:border-[var(--color-tide-400)] focus-visible:outline-2 focus-visible:outline-primary">
            <span class="block font-medium">{{ p.name }}</span>
            <span class="log-line text-sm text-muted">{{ p.slug }}</span>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="text-muted">
        No projects yet.{{ can('projects:create') ? ' Create one below to get an API key.' : ' Ask an admin to create one.' }}
      </p>

      <section v-if="can('projects:create')" class="mt-10 max-w-lg">
        <h2 class="text-lg font-medium">
          New project
        </h2>
        <UForm :schema="projectSchema" :state="state" class="mt-4 flex flex-col gap-4" @submit="create">
          <UFormField label="Name" name="name">
            <UInput v-model="state.name" placeholder="Checkout API" class="w-full" />
          </UFormField>
          <div>
            <UButton type="submit" :loading="creating">
              Create project
            </UButton>
          </div>
        </UForm>
      </section>
    </template>
  </PagePanel>
</template>
