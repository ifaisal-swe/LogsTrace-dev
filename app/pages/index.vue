<script setup lang="ts">
import { ROLE_LABELS } from '#shared/utils/permissions'

const { user } = useAuth()
useSeoMeta({
  title: 'LogsTrace: logs from any system, sorted into tables',
  ogTitle: 'LogsTrace',
  description: 'Send logs from your apps, services and scripts. LogsTrace groups repeated messages into tables with searchable columns, so you can answer questions without a query language.'
})

const DOCS = 'https://docs.logstrace.dev'

// Rounded down so the claim is always true, e.g. 12,345 -> "12K+"
const { data: platform } = await useFetch<{ logs: number }>('/api/public/stats')
const servedLogs = computed(() => {
  const n = platform.value?.logs ?? 0
  if (n < 1) return null
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1)
  return `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.floor(n / unit) * unit)}+`
})

const steps = [
  { title: 'Send', body: 'Post plain text or JSON to one endpoint with a project key. Arrays and fields from other loggers work as they are.' },
  { title: 'Group', body: 'Messages with the same wording become one table. The words that change become typed columns.' },
  { title: 'Ask', body: 'Filter, total and count any column over time, search one value across every table, and pin the answer to a dashboard.' }
]

const features = [
  {
    group: 'Find',
    items: [
      { icon: 'i-lucide-table-2', title: 'Tables from plain logs', body: 'No parsing rules. Name the columns once and they stay named.' },
      { icon: 'i-lucide-scan-search', title: 'Search one value everywhere', body: 'An order, user or request ID across every table at once.' },
      { icon: 'i-lucide-route', title: 'Follow a trace', body: 'Every message of one request or job, in order.' }
    ]
  },
  {
    group: 'Watch',
    items: [
      { icon: 'i-lucide-layout-dashboard', title: 'Dashboards', body: 'Time series, stats, ranked bars and live log panels on one screen.' },
      { icon: 'i-lucide-radio', title: 'Live tail', body: 'New messages appear as they arrive. Pause to read, resume to catch up.' },
      { icon: 'i-lucide-chart-column', title: 'Column profile', body: 'Most common values, empty rows and number spread for any column.' }
    ]
  },
  {
    group: 'Act',
    items: [
      { icon: 'i-lucide-bell', title: 'Alerts', body: 'Discord, Slack or webhook when errors arrive, volume spikes or something new appears.' },
      { icon: 'i-lucide-bookmark', title: 'Saved views', body: 'Share a filtered table or log stream with one link.' },
      { icon: 'i-lucide-download', title: 'CSV export and read API', body: 'Take any table or query into your own tools.' }
    ]
  },
  {
    group: 'Control',
    items: [
      { icon: 'i-lucide-eye-off', title: 'Masking by role', body: 'IPs, emails and tokens stay hidden from viewers, in search and filters too.' },
      { icon: 'i-lucide-clock', title: 'Retention', body: 'Keep messages for 7 days, a year or forever, per project.' },
      { icon: 'i-lucide-key-round', title: 'Scoped API keys', body: 'Send-only keys for servers, read keys for tools, revoke any time.' }
    ]
  }
]

const roles = (['owner', 'admin', 'member', 'viewer'] as const).map(r => ({
  role: r,
  ...ROLE_LABELS[r],
  sensitive: roleCan(r, 'logs:read_sensitive')
}))

const snippets = [
  {
    label: 'curl',
    code: `curl -X POST https://logstrace.dev/api/ingest \\
  -H "Authorization: Bearer $LOGSTRACE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"api","text":"GET /orders/10293 returned 200 in 84 ms"}'`
  },
  {
    label: 'Node.js',
    code: `await fetch('https://logstrace.dev/api/ingest', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.LOGSTRACE_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify([
    { channel: 'billing', level: 'warn', message: 'Card declined for order 10293', metadata: { amount: 249 } }
  ])
})`
  },
  {
    label: 'Python',
    code: `import os, requests

requests.post(
    "https://logstrace.dev/api/ingest",
    headers={"Authorization": f"Bearer {os.environ['LOGSTRACE_KEY']}"},
    json={"events": [{"channel": "jobs", "text": "Job invoice-sync finished 1840 items in 42 s"}]},
    timeout=5,
)`
  }
]
const snippetItems = snippets.map((s, i) => ({ label: s.label, value: String(i) }))
const snippet = ref('0')

const faq = [
  { label: 'Do I need to define a schema or parsing rules?', content: 'No. Send messages as you write them today. LogsTrace notices which messages repeat and turns the parts that change into columns. You can rename columns and set their type later.' },
  { label: 'What can I send?', content: 'Plain text, JSON with your own fields, or Discord-style embeds. One request can carry up to 500 messages. Field names from common loggers (message, metadata, level, timestamp) are accepted as they are.' },
  { label: 'Who can see personal data?', content: 'Owners and admins see everything. Members and viewers see IP addresses, email addresses and tokens masked, including in search, filters, exports, live view and alerts.' },
  { label: 'How long are messages kept?', content: 'You choose per project: from 7 days to a year, or forever. Older messages are deleted automatically every hour.' },
  { label: 'Can my team get notified?', content: 'Yes. Alerts post to Discord, Slack or any webhook when an error arrives, when message volume crosses a threshold, or when a new kind of message appears.' }
]
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="mx-auto max-w-6xl px-5 pt-10 sm:px-8 sm:pt-16">
      <p v-if="servedLogs" class="mb-6 inline-flex items-center gap-2 rounded-full border border-default bg-[var(--ui-bg-elevated)] px-3 py-1 text-sm text-muted">
        <span class="inline-block size-2 rounded-full bg-[var(--color-tide-500)]" />
        Serving <span class="font-semibold tabular-nums text-default">{{ servedLogs }}</span> logs
      </p>
      <div class="grid items-end gap-8 lg:grid-cols-[1.35fr_1fr]">
        <h1 class="max-w-[19ch] text-[clamp(2.4rem,5.4vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
          Every log message, sorted into a table you can ask questions.
        </h1>
        <div>
          <p class="max-w-[46ch] text-lg leading-relaxed text-muted">
            Send logs from your apps, services and scripts. LogsTrace groups messages that repeat and turns the parts that change into columns: amounts, IDs, durations, names.
          </p>
          <div class="mt-7 flex flex-wrap gap-3">
            <UButton v-if="user" to="/app/continue" size="xl">
              Open your logs
            </UButton>
            <UButton v-else to="/register" size="xl">
              Start for free
            </UButton>
            <UButton :to="DOCS" target="_blank" size="xl" variant="outline" color="neutral" icon="i-lucide-book-open">
              Read the docs
            </UButton>
          </div>
        </div>
      </div>

      <div class="mt-14">
        <LandingSorter />
        <p class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <span><span class="field-id font-medium">Teal</span> marks identifiers</span>
          <span><span class="field-number font-medium">Amber</span> marks numbers</span>
          <span><span class="field-text font-medium">Violet</span> marks names and text</span>
        </p>
      </div>
    </section>

    <!-- Use cases -->
    <section id="use-cases" class="mx-auto mt-28 max-w-6xl scroll-mt-8 px-5 sm:px-8">
      <h2 class="max-w-[22ch] text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        Questions your logs can already answer
      </h2>
      <p class="mt-3 max-w-[60ch] text-muted">
        The same idea works for any system. Here is what it looks like for four common jobs.
      </p>
      <div class="mt-10">
        <LandingUseCases />
      </div>
    </section>

    <!-- How it works: a real sequence, so it's numbered -->
    <section id="how" class="mx-auto mt-28 max-w-6xl scroll-mt-8 px-5 sm:px-8">
      <h2 class="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        From a message to an answer in three steps
      </h2>
      <ol class="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-3">
        <li v-for="(s, idx) in steps" :key="s.title" class="border-t-2 border-[var(--ui-text)] pt-5">
          <p class="text-sm tabular-nums text-muted">
            Step {{ idx + 1 }}
          </p>
          <h3 class="mt-1 text-xl font-medium">
            {{ s.title }}
          </h3>
          <p class="mt-2 leading-relaxed text-muted">
            {{ s.body }}
          </p>
        </li>
      </ol>

      <div class="mt-14 grid gap-10 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
        <div>
          <h3 class="text-xl font-medium">
            One endpoint for every system
          </h3>
          <p class="mt-3 max-w-[48ch] leading-relaxed text-muted">
            Create a project, copy its key and send your first message. Up to 500 messages per request, a separate key for each server, and trace IDs to follow one request across services.
          </p>
          <UButton :to="`${DOCS}/guides/getting-started/quickstart`" target="_blank" class="mt-5 px-0" variant="link" icon="i-lucide-book-open">
            Quickstart guide
          </UButton>
        </div>
        <div>
          <UTabs v-model="snippet" :items="snippetItems" :content="false" variant="link" size="sm" class="mb-3" />
          <pre class="log-line overflow-x-auto rounded-lg bg-[var(--color-moss-950)] p-5 text-[0.8rem] leading-6 text-[var(--color-moss-200)]">{{ snippets[Number(snippet)]?.code }}</pre>
        </div>
      </div>
    </section>

    <!-- Features, grouped by what you do with them -->
    <section id="features" class="mx-auto mt-28 max-w-6xl scroll-mt-8 px-5 sm:px-8">
      <h2 class="max-w-[24ch] text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        Everything you need after the log is written
      </h2>
      <div class="mt-10 divide-y divide-default border-y border-default">
        <div v-for="g in features" :key="g.group" class="grid gap-6 py-8 md:grid-cols-[10rem_1fr]">
          <h3 class="text-lg font-medium">
            {{ g.group }}
          </h3>
          <ul class="grid gap-6 sm:grid-cols-3">
            <li v-for="f in g.items" :key="f.title">
              <UIcon :name="f.icon" class="size-5 text-[var(--color-tide-600)]" />
              <p class="mt-2 font-medium">
                {{ f.title }}
              </p>
              <p class="mt-1 text-sm leading-relaxed text-muted">
                {{ f.body }}
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Access control -->
    <section id="teams" class="mx-auto mt-28 max-w-6xl scroll-mt-8 px-5 sm:px-8">
      <div class="grid gap-10 lg:grid-cols-[1fr_1.2fr] [&>*]:min-w-0">
        <div>
          <h2 class="max-w-[20ch] text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            Your team sees what their role allows
          </h2>
          <p class="mt-4 max-w-[52ch] leading-relaxed text-muted">
            Invite people to an organization with a role. Members and viewers read logs, but IP addresses, email addresses and tokens stay hidden, even in search and alerts.
          </p>
          <div class="mt-6 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4">
            <p class="text-sm text-muted">
              What a viewer sees
            </p>
            <p class="log-line mt-2 text-[0.8rem]">
              Sign-in for <span class="field-id">••••@••••</span> from <span class="field-id">•.•.•.•</span>
            </p>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-default text-sm text-muted">
                <th class="py-2 pe-4 font-normal">
                  Role
                </th>
                <th class="py-2 pe-4 font-normal">
                  What they can do
                </th>
                <th class="py-2 font-normal">
                  IPs and emails
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in roles" :key="r.role" class="border-b border-default/70 align-top">
                <td class="py-3.5 pe-4 font-medium">
                  {{ r.label }}
                </td>
                <td class="py-3.5 pe-4 text-muted">
                  {{ r.description }}
                </td>
                <td class="py-3.5">
                  <UIcon :name="r.sensitive ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="size-4" :class="r.sensitive ? 'text-primary' : 'text-muted'" />
                  <span class="sr-only">{{ r.sensitive ? 'Visible' : 'Hidden' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="mx-auto mt-28 grid max-w-6xl scroll-mt-8 gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
      <div>
        <h2 class="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          Questions
        </h2>
        <p class="mt-3 text-muted">
          More in the <a :href="DOCS" target="_blank" class="text-primary underline-offset-4 hover:underline">documentation</a>.
        </p>
      </div>
      <UAccordion :items="faq" :ui="{ label: 'text-base font-medium', body: 'text-muted leading-relaxed' }" />
    </section>

    <!-- Closing call to action -->
    <section class="mx-auto mt-28 max-w-6xl px-5 sm:px-8">
      <div class="flex flex-col gap-6 rounded-xl bg-[var(--color-moss-950)] px-6 py-10 text-[var(--color-moss-100)] sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <p class="max-w-[30ch] text-2xl font-medium leading-snug tracking-[-0.01em]">
          Create a project, copy its key and see your first table in minutes.
        </p>
        <div class="flex flex-wrap gap-3">
          <UButton :to="user ? '/app/continue' : '/register'" size="xl" color="neutral" variant="solid" class="bg-[var(--color-moss-50)] text-[var(--color-moss-950)] hover:bg-white">
            {{ user ? 'Open your logs' : 'Start for free' }}
          </UButton>
          <UButton :to="DOCS" target="_blank" size="xl" color="neutral" variant="ghost" class="text-[var(--color-moss-100)] hover:bg-white/10">
            Read the docs
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>
