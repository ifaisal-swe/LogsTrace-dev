<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Support · LogsTrace' })

type Row = { id: string, number: number, subject: string, category: TicketCategory, status: TicketStatus, lastMessageAt: string, unread: boolean }

const notify = useNotify()
const route = useRoute()
const { data: tickets, refresh } = await useFetch<Row[]>('/api/tickets', { default: () => [] })
const { data: projects } = useMyProjects()

const formOpen = ref(route.query.new === '1')
const saving = ref(false)
const blank = () => ({ subject: '', category: 'question' as TicketCategory, priority: 'normal' as 'low' | 'normal' | 'high', body: '', projectId: undefined as string | undefined })
const form = reactive(blank())

const categories = TICKET_CATEGORIES.map(c => ({ label: TICKET_CATEGORY_LABELS[c], value: c }))
const priorities = (['low', 'normal', 'high'] as const).map(p => ({ label: TICKET_PRIORITY_LABELS[p], value: p }))
const projectItems = computed(() => [
  { label: 'Not about a specific project', value: undefined },
  ...(projects.value ?? []).map(p => ({ label: `${p.projectName} · ${p.orgName}`, value: p.projectId }))
])

const active = computed(() => tickets.value.filter(t => t.status === 'open' || t.status === 'waiting'))
const past = computed(() => tickets.value.filter(t => t.status === 'resolved' || t.status === 'closed'))

async function submit(e: FormSubmitEvent<z.input<typeof ticketCreateSchema>>) {
  saving.value = true
  try {
    const res = await $fetch('/api/tickets', { method: 'POST', body: e.data })
    Object.assign(form, blank())
    formOpen.value = false
    notify.success(`Request #${res.number} sent`, 'We emailed you a copy.')
    await refresh()
    await navigateTo(`/app/support/${res.id}`)
  } catch (err) { notify.error(err) } finally { saving.value = false }
}
</script>

<template>
  <PagePanel title="Support" description="Ask a question, report a problem or send feedback. You get every answer by email too.">
    <template #actions>
      <UButton icon="i-lucide-plus" @click="formOpen = true">
        New request
      </UButton>
    </template>

    <UModal v-model:open="formOpen" title="New support request" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm :schema="ticketCreateSchema" :state="form" class="flex flex-col gap-4" @submit="submit">
          <UFormField label="Subject" name="subject">
            <UInput v-model="form.subject" placeholder="Short summary of the problem" class="w-full" maxlength="150" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Topic" name="category">
              <USelect v-model="form.category" :items="categories" class="w-full" />
            </UFormField>
            <UFormField label="How urgent is it?" name="priority">
              <USelect v-model="form.priority" :items="priorities" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-if="projects?.length" label="Project" name="projectId" help="Helps us look at the right place. We never read logs without asking.">
            <USelect v-model="form.projectId" :items="projectItems" class="w-full" />
          </UFormField>
          <UFormField label="Message" name="body" help="What happened, what you expected, and any error text. Don't paste passwords or API keys.">
            <UTextarea v-model="form.body" :rows="8" autoresize class="w-full" maxlength="10000" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="formOpen = false">
              Cancel
            </UButton>
            <UButton type="submit" :loading="saving" icon="i-lucide-send">
              Send request
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <div v-if="!tickets.length" class="rounded-lg border border-dashed border-default p-10 text-center">
      <UIcon name="i-lucide-life-buoy" class="mb-3 size-8 text-muted" />
      <p class="font-medium">
        No requests yet
      </p>
      <p class="mb-4 text-sm text-muted">
        Stuck on something? We're happy to help.
      </p>
      <UButton icon="i-lucide-plus" @click="formOpen = true">
        New request
      </UButton>
    </div>

    <div v-for="group in [{ title: 'Open', rows: active }, { title: 'Earlier', rows: past }]" :key="group.title">
      <template v-if="group.rows.length">
        <h2 class="mb-2 mt-6 text-sm font-medium text-muted first:mt-0">
          {{ group.title }}
        </h2>
        <ul class="overflow-hidden rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
          <li v-for="t in group.rows" :key="t.id" class="border-b border-default/70 last:border-0">
            <NuxtLink :to="`/app/support/${t.id}`" class="flex items-center gap-3 px-4 py-3 hover:bg-[var(--ui-bg-accented)]/40">
              <span class="size-2 shrink-0 rounded-full" :class="t.unread ? 'bg-primary' : 'bg-transparent'" :title="t.unread ? 'New reply' : undefined" />
              <span class="w-14 shrink-0 font-mono text-xs text-muted">#{{ t.number }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate" :class="t.unread ? 'font-semibold' : 'font-medium'">{{ t.subject }}</span>
                <span class="text-xs text-muted">{{ TICKET_CATEGORY_LABELS[t.category] }} · updated {{ new Date(t.lastMessageAt).toLocaleString() }}</span>
              </span>
              <TicketStatusBadge :status="t.status" />
            </NuxtLink>
          </li>
        </ul>
      </template>
    </div>
  </PagePanel>
</template>
