<script setup lang="ts">
import { ROLE_LABELS } from '#shared/utils/permissions'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Home · LogsTrace' })

const { user, orgs, refresh, requireEmailVerification } = useAuth()
const { data: projects, refresh: refreshProjects } = await useMyProjects()
const notify = useNotify()

const filter = ref('')
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return (projects.value ?? []).filter(p => !q || `${p.projectName} ${p.orgName}`.toLowerCase().includes(q))
})
const projectCount = (slug: string) => (projects.value ?? []).filter(p => p.orgSlug === slug).length

const ago = (iso: string | null) => {
  if (!iso) return 'No messages yet'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'Last message just now'
  if (s < 3600) return `Last message ${Math.round(s / 60)} min ago`
  if (s < 86400) return `Last message ${Math.round(s / 3600)} h ago`
  return `Last message ${new Date(iso).toLocaleDateString()}`
}
const isActive = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 300_000

const state = reactive({ name: '' })
const creating = ref(false)
const createOpen = ref(false)
async function create(e: FormSubmitEvent<z.infer<typeof orgSchema>>) {
  creating.value = true
  try {
    const org = await $fetch('/api/orgs', { method: 'POST', body: e.data })
    await refresh()
    await refreshProjects()
    notify.success('Organization created', 'Now create its first project.')
    await navigateTo(`/o/${org.slug}`)
  } catch (err) {
    notify.error(err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <PagePanel :title="user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Home'" log-data description="Pick a project and go straight to its logs.">
    <template #actions>
      <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="outline" @click="createOpen = !createOpen">
        New organization
      </UButton>
    </template>

    <UAlert
      v-if="user && !user.emailVerified"
      class="mb-6"
      :color="requireEmailVerification ? 'warning' : 'neutral'"
      variant="subtle"
      icon="i-lucide-mail"
      :title="requireEmailVerification ? 'Verify your email to create or join organizations.' : 'Your email isn\'t verified yet.'"
      :actions="[{ label: 'Verify now', to: '/verify-email?next=/app', color: 'neutral', variant: 'outline' }]"
    />

    <section v-if="createOpen || !orgs.length" class="mb-8 max-w-lg rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-5">
      <h2 class="font-medium">
        {{ orgs.length ? 'New organization' : 'Create your first organization' }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        An organization holds your projects and the people who can see them. You'll be its owner.
      </p>
      <UForm :schema="orgSchema" :state="state" class="mt-4 flex flex-wrap items-end gap-3" @submit="create">
        <UFormField label="Name" name="name" class="min-w-56 flex-1">
          <UInput v-model="state.name" placeholder="Acme" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="creating">
          Create
        </UButton>
      </UForm>
    </section>

    <template v-if="projects?.length">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-medium">
          Your projects
        </h2>
        <div class="flex items-center gap-3">
          <UInput v-if="projects.length > 4" v-model="filter" icon="i-lucide-search" placeholder="Find a project" size="sm" class="w-56" />
          <span class="hidden text-sm text-muted sm:inline-flex sm:items-center sm:gap-1">Jump anywhere <UKbd value="meta" /><UKbd value="K" /></span>
        </div>
      </div>
      <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="p in shown" :key="`${p.orgSlug}/${p.projectSlug}`" class="flex flex-col rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4 transition-colors hover:border-[var(--color-tide-400)]">
          <NuxtLink :to="`${projectPath(p)}/logs`" class="flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <p class="text-xs text-muted">
              {{ p.orgName }}
            </p>
            <p class="mt-0.5 flex items-center gap-2 font-medium">
              {{ p.projectName }}
              <span v-if="isActive(p.lastEvent)" class="inline-block size-2 rounded-full bg-[var(--color-tide-500)]" title="Messages in the last 5 minutes" />
            </p>
            <p class="mt-3 text-2xl font-semibold tabular-nums">
              {{ p.last24h.toLocaleString() }}
              <span class="text-sm font-normal text-muted">messages in 24 h</span>
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ ago(p.lastEvent) }}
            </p>
          </NuxtLink>
          <div class="mt-4 flex flex-wrap gap-1.5 border-t border-default pt-3">
            <UButton :to="`${projectPath(p)}/logs`" size="sm" icon="i-lucide-list">
              Logs
            </UButton>
            <UButton :to="`${projectPath(p)}/templates`" size="sm" color="neutral" variant="ghost" icon="i-lucide-table-2">
              Tables
            </UButton>
            <UButton :to="`${projectPath(p)}/dashboards`" size="sm" color="neutral" variant="ghost" icon="i-lucide-layout-dashboard">
              Dashboards
            </UButton>
          </div>
        </li>
      </ul>
      <p v-if="!shown.length" class="py-8 text-center text-muted">
        No project matches “{{ filter }}”.
      </p>
    </template>
    <UAlert
      v-else-if="orgs.length"
      color="neutral"
      variant="subtle"
      icon="i-lucide-folder-plus"
      title="No projects yet"
      description="Open an organization below to create a project. You'll get an API key and can send your first message in a minute."
    />

    <section v-if="orgs.length" class="mt-10">
      <h2 class="text-lg font-medium">
        Organizations
      </h2>
      <ul class="mt-3 divide-y divide-default overflow-hidden rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
        <li v-for="o in orgs" :key="o.id">
          <NuxtLink :to="`/o/${o.slug}`" class="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[var(--ui-bg-muted)] focus-visible:outline-2 focus-visible:outline-primary">
            <span>
              <span class="block font-medium">{{ o.name }}</span>
              <span class="text-sm text-muted">{{ ROLE_LABELS[o.role].label }} · {{ projectCount(o.slug) }} {{ projectCount(o.slug) === 1 ? 'project' : 'projects' }}</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
          </NuxtLink>
        </li>
      </ul>
    </section>
  </PagePanel>
</template>
