<script setup lang="ts">
// The landing hero: raw messages arrive on the left, their changing parts light up by type,
// and each message lands as a row in its template's table on the right.
type Part = string | { v: string, t: 'number' | 'id' | 'text', col: string }
type Sample = { tpl: 'req' | 'ship', parts: Part[] }

const n = (v: string, col: string) => ({ v, t: 'number' as const, col })
const i = (v: string, col: string) => ({ v, t: 'id' as const, col })
const x = (v: string, col: string) => ({ v, t: 'text' as const, col })

// One English and one Arabic template: LogsTrace groups messages in any language
const samples: Sample[] = [
  { tpl: 'req', parts: ['GET /orders/', i('10293', 'order'), ' returned ', n('200', 'status'), ' in ', n('84', 'ms'), ' ms'] },
  { tpl: 'ship', parts: ['تم شحن الطلب ', i('10293', 'order'), ' إلى ', x('الرياض', 'city')] },
  { tpl: 'req', parts: ['GET /orders/', i('77', 'order'), ' returned ', n('404', 'status'), ' in ', n('12', 'ms'), ' ms'] },
  { tpl: 'req', parts: ['GET /orders/', i('5120', 'order'), ' returned ', n('500', 'status'), ' in ', n('812', 'ms'), ' ms'] },
  { tpl: 'ship', parts: ['تم شحن الطلب ', i('5120', 'order'), ' إلى ', x('جدة', 'city')] },
  { tpl: 'req', parts: ['GET /orders/', i('318', 'order'), ' returned ', n('200', 'status'), ' in ', n('61', 'ms'), ' ms'] }
]

const tables = {
  req: { name: 'http_request', cols: ['order', 'status', 'ms'] },
  ship: { name: 'order_shipped', cols: ['order', 'city'] }
} as const

const typeOf: Record<string, 'number' | 'id' | 'text'> = { order: 'id', status: 'number', ms: 'number', city: 'text' }

// `shown` holds an ever-increasing message counter; the sample is counter % samples.length.
// The stream never clears, so the panel is never empty between loops.
const PREFILL = 2
const shown = ref<number[]>(Array.from({ length: PREFILL }, (_, k) => k))
const lit = ref(-1)
let timer: ReturnType<typeof setTimeout> | undefined

const sampleOf = (k: number) => samples[k % samples.length]!

function rowsFor(tpl: 'req' | 'ship') {
  return shown.value.filter(k => sampleOf(k).tpl === tpl && k !== lit.value).slice(-4).map((k) => {
    const values: Record<string, Part> = {}
    for (const p of sampleOf(k).parts) if (typeof p !== 'string') values[p.col] = p
    return { k, values }
  })
}

function step(k: number) {
  shown.value = [...shown.value.slice(-11), k]
  lit.value = k
  // Highlight first, then file the row into its table
  timer = setTimeout(() => {
    lit.value = -1
    timer = setTimeout(() => step(k + 1), 1400)
  }, 1100)
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shown.value = samples.map((_, k) => k)
    return
  }
  timer = setTimeout(() => step(PREFILL), 900)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="grid gap-px overflow-hidden rounded-lg border border-default bg-[var(--ui-border)] lg:grid-cols-[1.1fr_1fr]">
    <section class="bg-[var(--ui-bg-elevated)] p-5 sm:p-6" aria-label="Incoming messages">
      <p class="mb-4 text-sm text-muted">
        Incoming messages
      </p>
      <ol class="flex min-h-[19rem] flex-col gap-2.5">
        <li
          v-for="k in shown.slice(-5)"
          :key="k"
          class="log-line rounded-md px-3 py-2 text-[0.8rem] leading-relaxed transition-colors duration-500"
          :class="lit === k ? 'bg-[var(--color-moss-200)]' : 'bg-transparent'"
        >
          <template v-for="(p, pi) in sampleOf(k).parts" :key="pi">
            <span v-if="typeof p === 'string'" class="text-muted">{{ p }}</span>
            <span v-else :class="`field-${p.t}`" class="font-medium">{{ p.v }}</span>
          </template>
        </li>
      </ol>
    </section>

    <section class="flex flex-col gap-6 bg-[var(--ui-bg-elevated)] p-5 sm:p-6" aria-label="Tables built from those messages">
      <div v-for="tpl in (['req', 'ship'] as const)" :key="tpl">
        <p class="mb-2 text-sm">
          <span class="font-medium">{{ tables[tpl].name }}</span>
          <span class="ms-2 text-muted">{{ rowsFor(tpl).length }} {{ rowsFor(tpl).length === 1 ? 'row' : 'rows' }}</span>
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-[0.8rem]">
            <thead>
              <tr class="border-b border-default">
                <th v-for="c in tables[tpl].cols" :key="c" class="py-1.5 pe-4 font-normal text-muted">
                  <span class="me-1.5 inline-block size-2 rounded-full align-middle" :style="{ background: `var(--color-field-${typeOf[c]})` }" />{{ c }}
                </th>
              </tr>
            </thead>
            <TransitionGroup tag="tbody" name="row">
              <tr v-for="r in rowsFor(tpl)" :key="r.k" class="border-b border-default/60">
                <td v-for="c in tables[tpl].cols" :key="c" class="py-1.5 pe-4">
                  <FieldValue :type="typeOf[c]!" :value="(r.values[c] as { v: string })?.v ?? ''" />
                </td>
              </tr>
            </TransitionGroup>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.row-enter-active { transition: opacity 0.45s ease, transform 0.45s ease; }
.row-enter-from { opacity: 0; transform: translateX(-12px); }
</style>
