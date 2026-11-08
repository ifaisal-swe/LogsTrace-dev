<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

type Detail = {
  ticket: { id: string, number: number, subject: string, category: TicketCategory, priority: TicketPriority, status: TicketStatus, projectName: string | null, createdAt: string }
  messages: TicketThreadMessage[]
  replyByEmail: boolean
}

const route = useRoute()
const notify = useNotify()
const id = computed(() => String(route.params.id))
const { data, refresh, error } = await useFetch<Detail>(() => `/api/tickets/${id.value}`)
useSeoMeta({ title: () => data.value ? `#${data.value.ticket.number} ${data.value.ticket.subject} · Support` : 'Support · LogsTrace' })

const reply = ref('')
const sending = ref(false)
const closed = computed(() => data.value?.ticket.status === 'closed')

async function send() {
  const body = reply.value.trim()
  if (!body) return
  sending.value = true
  try {
    await $fetch(`/api/tickets/${id.value}/messages`, { method: 'POST', body: { body } })
    reply.value = ''
    await refresh()
  } catch (err) { notify.error(err) } finally { sending.value = false }
}

async function setStatus(status: 'resolved' | 'open') {
  try {
    await $fetch(`/api/tickets/${id.value}`, { method: 'PATCH', body: { status } })
    notify.success(status === 'resolved' ? 'Marked as resolved' : 'Request reopened')
    await refresh()
  } catch (err) { notify.error(err) }
}
</script>

<template>
  <PagePanel :title="data ? `#${data.ticket.number}` : 'Support request'">
    <template #actions>
      <UButton to="/app/support" color="neutral" variant="ghost" icon="i-lucide-arrow-left">
        All requests
      </UButton>
    </template>

    <UAlert v-if="error" color="error" variant="subtle" title="This request doesn't exist or isn't yours." />
    <div v-else-if="data" class="flex flex-col gap-6">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">
            {{ data.ticket.subject }}
          </h1>
          <p class="mt-1 text-sm text-muted">
            {{ TICKET_CATEGORY_LABELS[data.ticket.category] }}
            <template v-if="data.ticket.projectName">
              · {{ data.ticket.projectName }}
            </template>
            · opened {{ new Date(data.ticket.createdAt).toLocaleString() }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <TicketStatusBadge :status="data.ticket.status" />
          <UButton v-if="data.ticket.status === 'open' || data.ticket.status === 'waiting'" size="sm" color="neutral" variant="outline" icon="i-lucide-check" @click="setStatus('resolved')">
            Mark resolved
          </UButton>
          <UButton v-else-if="data.ticket.status === 'resolved'" size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" @click="setStatus('open')">
            Reopen
          </UButton>
        </div>
      </header>

      <TicketThread :messages="data.messages" viewer="user" />

      <UAlert
        v-if="closed"
        icon="i-lucide-lock"
        color="neutral"
        variant="subtle"
        title="This request is closed."
        description="Need more help? Open a new request and mention this number."
        :actions="[{ label: 'New request', to: '/app/support?new=1', icon: 'i-lucide-plus' }]"
      />
      <form v-else class="flex flex-col gap-3" @submit.prevent="send">
        <UTextarea v-model="reply" :rows="5" autoresize placeholder="Write a reply…" maxlength="10000" class="w-full" />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs text-muted">
            {{ data.replyByEmail ? 'You can also answer by replying to our emails.' : 'We email you when support answers.' }}
          </p>
          <UButton type="submit" :loading="sending" :disabled="!reply.trim()" icon="i-lucide-send">
            {{ data.ticket.status === 'resolved' ? 'Reply and reopen' : 'Send reply' }}
          </UButton>
        </div>
      </form>
    </div>
  </PagePanel>
</template>
