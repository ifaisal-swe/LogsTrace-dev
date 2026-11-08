<script setup lang="ts">
// Use cases on the landing page: a raw message, the table LogsTrace makes from it, and a question that table answers
type Part = string | { v: string, t: 'number' | 'id' | 'text' }
type UseCase = {
  key: string
  label: string
  icon: string
  intro: string
  log: Part[]
  table: string
  columns: { name: string, t: 'number' | 'id' | 'text' }[]
  question: string
  answer: { label: string, value: number, unit: string }[]
}

const n = (v: string) => ({ v, t: 'number' as const })
const i = (v: string) => ({ v, t: 'id' as const })
const x = (v: string) => ({ v, t: 'text' as const })

const cases: UseCase[] = [
  {
    key: 'payments',
    label: 'Payments and orders',
    icon: 'i-lucide-credit-card',
    intro: 'Follow every order from checkout to delivery and see where money is lost.',
    log: ['Payment ', i('8813'), ' for order ', i('10294'), ' declined by ', x('stripe'), ': ', n('120.00'), ' USD'],
    table: 'payment_declined',
    columns: [{ name: 'payment', t: 'id' }, { name: 'order', t: 'id' }, { name: 'provider', t: 'text' }, { name: 'amount', t: 'number' }],
    question: 'Declined amount by provider, last 7 days',
    answer: [{ label: 'stripe', value: 18420, unit: 'USD' }, { label: 'paypal', value: 9310, unit: 'USD' }, { label: 'tap', value: 2150, unit: 'USD' }]
  },
  {
    key: 'api',
    label: 'APIs and performance',
    icon: 'i-lucide-gauge',
    intro: 'Spot slow endpoints and rising error rates before customers report them.',
    log: [x('GET'), ' ', x('/orders/:id'), ' returned ', n('500'), ' in ', n('812'), ' ms'],
    table: 'http_request',
    columns: [{ name: 'method', t: 'text' }, { name: 'route', t: 'text' }, { name: 'status', t: 'number' }, { name: 'duration_ms', t: 'number' }],
    question: 'Average response time per route, today',
    answer: [{ label: '/checkout', value: 640, unit: 'ms' }, { label: '/orders/:id', value: 212, unit: 'ms' }, { label: '/search', value: 95, unit: 'ms' }]
  },
  {
    key: 'auth',
    label: 'Sign-ins and security',
    icon: 'i-lucide-shield-check',
    intro: 'See who signs in from where, catch repeated failures, and keep personal data hidden from people who don’t need it.',
    log: ['Sign-in failed for user ', i('4127'), ' from ', i('•.•.•.•'), ': ', x('wrong_password')],
    table: 'signin_failed',
    columns: [{ name: 'user', t: 'id' }, { name: 'ip', t: 'id' }, { name: 'reason', t: 'text' }],
    question: 'Users with the most failed sign-ins, last hour',
    answer: [{ label: 'user 4127', value: 23, unit: 'attempts' }, { label: 'user 918', value: 7, unit: 'attempts' }, { label: 'user 3301', value: 4, unit: 'attempts' }]
  },
  {
    key: 'jobs',
    label: 'Background jobs',
    icon: 'i-lucide-timer',
    intro: 'Know when a scheduled job stops running, slows down or starts failing.',
    log: ['Job ', x('invoice-sync'), ' finished ', n('1840'), ' items in ', n('42'), ' s'],
    table: 'job_finished',
    columns: [{ name: 'job', t: 'text' }, { name: 'items', t: 'number' }, { name: 'seconds', t: 'number' }],
    question: 'Slowest jobs by average run time, this week',
    answer: [{ label: 'invoice-sync', value: 44, unit: 's' }, { label: 'report-export', value: 31, unit: 's' }, { label: 'cleanup', value: 6, unit: 's' }]
  }
]

const active = ref(cases[0]!.key)
const current = computed(() => cases.find(c => c.key === active.value)!)
const max = computed(() => Math.max(...current.value.answer.map(a => a.value)))
const values = computed(() => current.value.log.filter((p): p is Exclude<Part, string> => typeof p !== 'string'))
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2" role="tablist" aria-label="Use cases">
      <button
        v-for="c in cases"
        :key="c.key"
        type="button"
        role="tab"
        :aria-selected="active === c.key"
        class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="active === c.key ? 'border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-bg)]' : 'border-default text-muted hover:text-default'"
        @click="active = c.key"
      >
        <UIcon :name="c.icon" class="size-4" />{{ c.label }}
      </button>
    </div>

    <div class="mt-6 grid overflow-hidden rounded-xl border border-default bg-[var(--ui-bg-elevated)] lg:grid-cols-[1.15fr_1fr]" role="tabpanel">
      <div class="border-b border-default p-6 sm:p-8 lg:border-b-0 lg:border-e">
        <p class="max-w-[46ch] text-lg leading-relaxed">
          {{ current.intro }}
        </p>

        <p class="mt-7 text-sm text-muted">
          Your app sends
        </p>
        <p class="log-line mt-2 rounded-lg bg-[var(--color-moss-950)] px-4 py-3 text-[0.82rem] leading-relaxed text-[var(--color-moss-200)]">
          <template v-for="(p, pi) in current.log" :key="pi">
            <span v-if="typeof p === 'string'">{{ p }}</span>
            <span v-else :class="`field-${p.t}`" class="font-medium brightness-150">{{ p.v }}</span>
          </template>
        </p>

        <p class="mt-6 text-sm text-muted">
          LogsTrace files it as a row in <span class="log-line text-default">{{ current.table }}</span>
        </p>
        <div class="mt-2 overflow-x-auto">
          <table class="w-full text-left text-[0.82rem]">
            <thead>
              <tr class="border-b border-default">
                <th v-for="col in current.columns" :key="col.name" class="py-1.5 pe-4 font-normal text-muted">
                  <span class="me-1.5 inline-block size-2 rounded-full align-middle" :style="{ background: `var(--color-field-${col.t})` }" />{{ col.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td v-for="(v, vi) in values" :key="vi" class="py-1.5 pe-4">
                  <FieldValue :type="v.t" :value="v.v" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="p-6 sm:p-8">
        <p class="text-sm text-muted">
          Then you ask
        </p>
        <p class="mt-1 text-lg font-medium">
          {{ current.question }}
        </p>
        <ul class="mt-6 flex flex-col gap-4">
          <li v-for="a in current.answer" :key="a.label">
            <div class="flex items-baseline justify-between gap-3 text-sm">
              <span class="log-line">{{ a.label }}</span>
              <span class="font-semibold tabular-nums">{{ a.value.toLocaleString('en') }} <span class="font-normal text-muted">{{ a.unit }}</span></span>
            </div>
            <div class="mt-1.5 h-2 rounded-sm bg-[var(--ui-bg-muted)]">
              <div class="h-2 rounded-sm bg-[var(--chart-single)] transition-[width] duration-500" :style="{ width: `${(a.value / max) * 100}%` }" />
            </div>
          </li>
        </ul>
        <p class="mt-6 text-sm text-muted">
          No query language: pick a column, a calculation and a time range. Save it to a dashboard or set an alert on it.
        </p>
      </div>
    </div>
  </div>
</template>
