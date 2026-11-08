<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'support'] })

type Detail = {
  ticket: { id: string, number: number, subject: string, category: TicketCategory, priority: TicketPriority, status: TicketStatus, assigneeId: string | null, createdAt: string }
  requester: { id: string, name: string, email: string, createdAt: string, emailVerifiedAt: string | null } | null
  project: { name: string, slug: string, orgName: string, orgSlug: string } | null
  otherTickets: { id: string, number: number, subject: string, status: TicketStatus }[]
  messages: TicketThreadMessage[]
  replyByEmail: boolean
}

const route = useRoute()
const notify = useNotify()
const { user: me } = useAuth()
const id = computed(() => String(route.params.id))
const { data, refresh, error } = await useFetch<Detail>(() => `/api/support/tickets/${id.value}`)
const { data: staff } = await useFetch<{ id: string, name: string }[]>('/api/support/staff', { default: () => [] })
useSeoMeta({ title: () => data.value ? `#${data.value.ticket.number} · Support inbox` : 'Support inbox · LogsTrace' })

const reply = ref('')
const internal = ref(false)
const sending = ref(false)

async function send(status?: TicketStatus) {
  const body = reply.value.trim()
  if (!body) return
  sending.value = true
  try {
    await $fetch(`/api/support/tickets/${id.value}/messages`, { method: 'POST', body: { body, internal: internal.value, status } })
    reply.value = ''
    notify.success(internal.value ? 'Note saved' : 'Reply sent', internal.value ? undefined : 'The requester gets it by email.')
    await refresh()
  } catch (err) { notify.error(err) } finally { sending.value = false }
}

async function change(body: { status?: TicketStatus, priority?: TicketPriority, assigneeId?: string | null }) {
  try {
    await $fetch(`/api/support/tickets/${id.value}`, { method: 'PATCH', body })
    await refresh()
  } catch (err) { notify.error(err) }
}

const statusItems = TICKET_STATUSES.map(s => ({ label: TICKET_STAFF_STATUS_LABELS[s], value: s }))
const priorityItems = TICKET_PRIORITIES.map(p => ({ label: TICKET_PRIORITY_LABELS[p], value: p }))
// USelect can't hold null, so "unassigned" is an empty string here
const assigneeItems = computed(() => [{ label: 'Unassigned', value: 'none' }, ...staff.value.map(s => ({ label: s.id === me.value?.id ? `${s.name} (you)` : s.name, value: s.id }))])
</script>

<template>
  <PagePanel :title="data ? `#${data.ticket.number}` : 'Ticket'">
    <template #actions>
      <UButton to="/app/admin/tickets" color="neutral" variant="ghost" icon="i-lucide-arrow-left">
        Inbox
      </UButton>
    </template>

    <UAlert v-if="error" color="error" variant="subtle" title="Ticket not found." />
    <div v-else-if="data" class="grid gap-8 lg:grid-cols-[1fr_16rem]">
      <div class="flex min-w-0 flex-col gap-6">
        <header>
          <h1 class="text-xl font-semibold">
            {{ data.ticket.subject }}
          </h1>
          <p class="mt-1 text-sm text-muted">
            {{ TICKET_CATEGORY_LABELS[data.ticket.category] }} · opened {{ new Date(data.ticket.createdAt).toLocaleString() }}
          </p>
        </header>

        <TicketThread :messages="data.messages" viewer="staff" />

        <form class="flex flex-col gap-3" @submit.prevent="send()">
          <UTextarea
            v-model="reply"
            :rows="6"
            autoresize
            maxlength="10000"
            :placeholder="internal ? 'Internal note (only the support team sees this)…' : `Reply to ${data.requester?.name ?? 'the requester'}…`"
            class="w-full"
            :ui="{ base: internal ? 'bg-warning/5 ring-warning/50' : '' }"
          />
          <div class="flex flex-wrap items-center justify-between gap-2">
            <USwitch v-model="internal" label="Internal note" />
            <div class="flex gap-2">
              <UButton v-if="!internal" color="neutral" variant="outline" :loading="sending" :disabled="!reply.trim()" icon="i-lucide-check" @click="send('resolved')">
                Send and resolve
              </UButton>
              <UButton type="submit" :loading="sending" :disabled="!reply.trim()" :color="internal ? 'warning' : 'primary'" :icon="internal ? 'i-lucide-sticky-note' : 'i-lucide-send'">
                {{ internal ? 'Save note' : 'Send reply' }}
              </UButton>
            </div>
          </div>
          <p v-if="data.replyByEmail" class="text-xs text-muted">
            You can also answer from your inbox: reply to the notification email. Start with /note for an internal note, end with /resolve to resolve.
          </p>
        </form>
      </div>

      <aside class="flex flex-col gap-5 text-sm">
        <UFormField label="Status">
          <USelect :model-value="data.ticket.status" :items="statusItems" class="w-full" @update:model-value="v => change({ status: v as TicketStatus })" />
        </UFormField>
        <UFormField label="Priority">
          <USelect :model-value="data.ticket.priority" :items="priorityItems" class="w-full" @update:model-value="v => change({ priority: v as TicketPriority })" />
        </UFormField>
        <UFormField label="Assignee">
          <USelect :model-value="data.ticket.assigneeId ?? 'none'" :items="assigneeItems" class="w-full" @update:model-value="v => change({ assigneeId: v && v !== 'none' ? String(v) : null })" />
        </UFormField>

        <section class="border-t border-default pt-4">
          <h2 class="mb-2 font-medium">
            Requester
          </h2>
          <template v-if="data.requester">
            <p>{{ data.requester.name }}</p>
            <p class="break-all text-muted">
              {{ data.requester.email }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Joined {{ new Date(data.requester.createdAt).toLocaleDateString() }}{{ data.requester.emailVerifiedAt ? '' : ' · email not verified' }}
            </p>
          </template>
          <p v-else class="text-muted">
            Deleted user
          </p>
        </section>

        <section v-if="data.project" class="border-t border-default pt-4">
          <h2 class="mb-2 font-medium">
            Project
          </h2>
          <p>{{ data.project.name }}</p>
          <p class="text-muted">
            {{ data.project.orgName }}
          </p>
        </section>

        <section v-if="data.otherTickets.length" class="border-t border-default pt-4">
          <h2 class="mb-2 font-medium">
            Other requests
          </h2>
          <ul class="flex flex-col gap-1.5">
            <li v-for="o in data.otherTickets" :key="o.id">
              <NuxtLink :to="`/app/admin/tickets/${o.id}`" class="flex gap-2 hover:underline">
                <span class="font-mono text-xs text-muted">#{{ o.number }}</span>
                <span class="truncate">{{ o.subject }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </PagePanel>
</template>
