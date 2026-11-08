<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'support'] })
useSeoMeta({ title: 'Support inbox · LogsTrace' })

type Row = {
  id: string, number: number, subject: string, category: TicketCategory, priority: TicketPriority, status: TicketStatus,
  lastMessageAt: string, requesterName: string, requesterEmail: string, assigneeName: string | null, unread: boolean
}

const route = useRoute()
const router = useRouter()
const status = ref(String(route.query.status ?? 'open'))
const assigned = ref(String(route.query.assigned ?? 'any'))
const q = ref('')
const search = useDebounced(q, 300)
watch([status, assigned], () => router.replace({ query: { ...route.query, status: status.value, assigned: assigned.value } }))

const { data, refresh } = await useFetch<{ tickets: Row[], counts: Partial<Record<TicketStatus, number>> }>('/api/support/tickets', {
  query: { status, assigned, q: search },
  default: () => ({ tickets: [], counts: {} })
})
// The inbox is often left open; keep it fresh without a reload
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => refresh(), 30_000) })
onBeforeUnmount(() => clearInterval(timer))

const tabs = computed(() => [
  { label: 'Needs reply', value: 'open', badge: data.value.counts.open },
  { label: 'Waiting on requester', value: 'waiting', badge: data.value.counts.waiting },
  { label: 'All active', value: 'active' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
  { label: 'Everything', value: 'all' }
])
const assignedItems = [{ label: 'Anyone', value: 'any' }, { label: 'Assigned to me', value: 'me' }, { label: 'Unassigned', value: 'none' }]
const PRIORITY_COLORS = { urgent: 'error', high: 'warning', normal: 'neutral', low: 'neutral' } as const
</script>

<template>
  <PagePanel title="Support inbox" description="Requests from every user. Replies here are emailed to the requester; internal notes are not.">
    <UTabs v-model="status" :items="tabs" :content="false" variant="link" class="mb-4" />
    <div class="mb-4 flex flex-wrap gap-2">
      <UInput v-model="q" icon="i-lucide-search" placeholder="Subject, requester or #number" class="w-full max-w-sm" />
      <USelect v-model="assigned" :items="assignedItems" class="w-48" />
    </div>

    <div v-if="!data.tickets.length" class="rounded-lg border border-dashed border-default p-10 text-center text-muted">
      Nothing here.
    </div>
    <ul v-else class="overflow-hidden rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
      <li v-for="t in data.tickets" :key="t.id" class="border-b border-default/70 last:border-0">
        <NuxtLink :to="`/app/admin/tickets/${t.id}`" class="flex items-center gap-3 px-4 py-3 hover:bg-[var(--ui-bg-accented)]/40">
          <span class="size-2 shrink-0 rounded-full" :class="t.unread ? 'bg-primary' : 'bg-transparent'" />
          <span class="w-14 shrink-0 font-mono text-xs text-muted">#{{ t.number }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate" :class="t.unread ? 'font-semibold' : 'font-medium'">{{ t.subject }}</span>
            <span class="block truncate text-xs text-muted">
              {{ t.requesterName }} &lt;{{ t.requesterEmail }}&gt; · {{ TICKET_CATEGORY_LABELS[t.category] }} · {{ new Date(t.lastMessageAt).toLocaleString() }}
            </span>
          </span>
          <UBadge v-if="t.priority !== 'normal'" :color="PRIORITY_COLORS[t.priority]" variant="subtle">
            {{ TICKET_PRIORITY_LABELS[t.priority] }}
          </UBadge>
          <span class="hidden w-28 truncate text-xs text-muted md:block">{{ t.assigneeName ?? 'Unassigned' }}</span>
          <TicketStatusBadge :status="t.status" staff />
        </NuxtLink>
      </li>
    </ul>
  </PagePanel>
</template>
