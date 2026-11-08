<script setup lang="ts">
const props = defineProps<{
  url: string
  field: TemplateFieldRow
  from?: string
  filters: TableFilter[]
}>()
const emit = defineEmits<{ filter: [f: TableFilter] }>()

const data = ref<ColumnProfile | null>(null)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await $fetch<ColumnProfile>(props.url, { method: 'POST', body: { field: props.field.position, from: props.from, filters: props.filters } })
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}
watch(() => [props.field.position, props.from, JSON.stringify(props.filters)], load, { immediate: true })

const fmt = (n: number | null | undefined) => n === null || n === undefined ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
const pct = (n: number, of: number) => of ? `${((n / of) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : '0%'
const topMax = computed(() => Math.max(1, ...(data.value?.top ?? []).map(t => t.n)))
const hist = computed(() => data.value?.numbers?.histogram ?? [])
</script>

<template>
  <div class="flex flex-col gap-6" :class="{ 'opacity-60': loading }" aria-live="polite">
    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <template v-if="data">
      <dl class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-default bg-[var(--ui-border)] text-sm">
        <div class="bg-[var(--ui-bg-elevated)] p-3">
          <dt class="text-muted">
            Rows
          </dt>
          <dd class="mt-0.5 text-lg font-semibold tabular-nums">
            {{ fmt(data.total) }}
          </dd>
        </div>
        <div class="bg-[var(--ui-bg-elevated)] p-3">
          <dt class="text-muted">
            Distinct
          </dt>
          <dd class="mt-0.5 text-lg font-semibold tabular-nums">
            {{ fmt(data.distinct) }}
          </dd>
        </div>
        <div class="bg-[var(--ui-bg-elevated)] p-3">
          <dt class="text-muted">
            Empty
          </dt>
          <dd class="mt-0.5 text-lg font-semibold tabular-nums">
            {{ pct(data.empty, data.total) }}
          </dd>
        </div>
      </dl>

      <section v-if="data.numbers">
        <h3 class="text-sm font-medium">
          Numbers
        </h3>
        <dl class="mt-2 grid grid-cols-5 gap-2 text-sm">
          <div v-for="[k, v] in ([['Lowest', data.numbers.min], ['Median', data.numbers.p50], ['Average', data.numbers.avg], ['95th pct', data.numbers.p95], ['Highest', data.numbers.max]] as const)" :key="k">
            <dt class="text-muted">
              {{ k }}
            </dt>
            <dd class="font-medium tabular-nums">
              {{ fmt(v) }}
            </dd>
          </div>
        </dl>
        <div v-if="hist.length > 1" class="mt-4">
          <MiniBars
            :values="hist.map(h => h.n)"
            :titles="hist.map(h => `${fmt(h.from)} – ${fmt(h.to)}: ${h.n.toLocaleString()} rows`)"
            :height="72"
            :label="`Distribution of ${field.name}`"
            color="var(--color-field-number)"
          />
          <div class="mt-1 flex justify-between text-xs tabular-nums text-muted">
            <span>{{ fmt(data.numbers.min) }}</span>
            <span>{{ fmt(data.numbers.max) }}</span>
          </div>
        </div>
      </section>

      <section>
        <h3 class="text-sm font-medium">
          Most common values
        </h3>
        <p v-if="!data.top.length" class="mt-2 text-sm text-muted">
          No rows match.
        </p>
        <p v-else-if="data.total > 10 && data.distinct === data.total" class="mt-2 text-sm text-muted">
          Every value is different, so none is more common than another.
        </p>
        <ul v-if="data.top.length && !(data.total > 10 && data.distinct === data.total)" class="mt-2 flex flex-col gap-1">
          <li v-for="t in data.top" :key="t.value">
            <button
              type="button"
              class="group grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-start text-sm hover:bg-[var(--ui-bg-muted)] focus-visible:outline-2 focus-visible:outline-primary"
              :title="t.value ? `Show only rows where ${field.name} is ${t.value}` : `Show only rows where ${field.name} is empty`"
              @click="emit('filter', t.value ? { field: field.position, op: 'eq', value: t.value } : { field: field.position, op: 'empty', value: '' })"
            >
              <span class="min-w-0">
                <FieldValue :type="field.type" :value="t.value || '(empty)'" class="block truncate" />
                <span class="mt-1 block h-1.5 rounded-sm bg-[var(--chart-single)]" :style="{ width: `${Math.max(2, t.n / topMax * 100)}%` }" />
              </span>
              <span class="tabular-nums text-muted">
                {{ fmt(t.n) }} <span class="text-xs">({{ pct(t.n, data.total) }})</span>
              </span>
            </button>
          </li>
        </ul>
        <p v-if="data.top.length && !(data.total > 10 && data.distinct === data.total)" class="mt-2 text-xs text-muted">
          Click a value to filter the table by it.
        </p>
      </section>
      <p v-if="data.masked" class="text-xs text-muted">
        Hidden IPs, emails and tokens are counted in their masked form.
      </p>
    </template>
  </div>
</template>
