<script setup lang="ts">
const props = defineProps<{ api: string, page: string }>()

const EXAMPLES = [
  'Which 10 users caused the most errors in the last 24 hours?',
  'What did the users who hit a timeout do right before it?',
  'How did the average response time change per hour this week?'
]

const { data: templates } = useFetch<TemplateRow[]>(() => `${props.api}/templates`, { default: () => [], lazy: true })
const question = ref('')
const plan = ref<AiPlan | null>(null)
const notes = ref<string | null>(null)
const results = ref<StepResult[] | null>(null)
const masked = ref(false)
const planning = ref(false)
const running = ref(false)
const errorMsg = ref('')

const rangeItems = Object.entries(PLAN_RANGE_LABEL).map(([value, label]) => ({ value, label: label[0]!.toUpperCase() + label.slice(1) }))

async function makePlan() {
  planning.value = true
  errorMsg.value = ''
  results.value = null
  try {
    const res = await $fetch<{ plan: AiPlan, notes: string | null }>(`${props.api}/ai/plan`, { method: 'POST', body: { question: question.value } })
    plan.value = res.plan
    notes.value = res.notes
  } catch (err) {
    errorMsg.value = apiErrorMessage(err)
  } finally {
    planning.value = false
  }
}

const change = ref('')
const refining = ref(false)
async function refine() {
  if (!plan.value) return
  refining.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ plan: AiPlan, notes: string | null }>(`${props.api}/ai/plan`, { method: 'POST', body: { question: question.value, previous: plan.value, change: change.value } })
    plan.value = res.plan
    notes.value = res.notes
    results.value = null
    change.value = ''
  } catch (err) {
    errorMsg.value = apiErrorMessage(err)
  } finally {
    refining.value = false
  }
}

async function run() {
  if (!plan.value) return
  running.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ results: StepResult[], masked: boolean }>(`${props.api}/ai/run`, { method: 'POST', body: { plan: plan.value } })
    results.value = res.results
    masked.value = res.masked
  } catch (err) {
    errorMsg.value = apiErrorMessage(err)
  } finally {
    running.value = false
  }
}

function reset() {
  plan.value = null
  results.value = null
  notes.value = null
}

const answer = computed(() => results.value?.at(-1) ?? null)
const earlier = computed(() => results.value?.slice(0, -1) ?? [])

function cell(type: StepColumn['type'], v: string | number | null) {
  if (v === null || v === '') return '—'
  if (type === 'time') return new Date(String(v)).toLocaleString()
  if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return String(v)
}
</script>

<template>
  <div>
    <form v-if="!plan" class="flex flex-col gap-3" @submit.prevent="makePlan">
      <UTextarea
        v-model="question"
        :rows="3"
        autoresize
        maxlength="1000"
        class="w-full"
        placeholder="Ask about your logs in plain words…"
        aria-label="Question about your logs"
        @keydown.enter.exact.prevent="question.trim().length >= 3 && makePlan()"
      />
      <div class="flex flex-wrap items-center gap-2">
        <UButton type="submit" icon="i-lucide-sparkles" :loading="planning" :disabled="question.trim().length < 3">
          Make a plan
        </UButton>
        <UButton v-for="e in EXAMPLES" :key="e" size="xs" color="neutral" variant="soft" class="max-w-full" @click="question = e">
          <span class="truncate">{{ e }}</span>
        </UButton>
      </div>
      <p class="text-sm text-muted">
        The AI writes the steps; it doesn't read your logs. You check the plan, then LogsTrace runs it with your own access, read-only.
      </p>
    </form>

    <section v-else class="rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-muted">
            Plan for “{{ question }}”
          </p>
          <h2 class="mt-1 text-lg font-medium">
            {{ plan.title }}
          </h2>
          <p v-if="plan.explanation" class="mt-1 max-w-[70ch] text-muted">
            {{ plan.explanation }}
          </p>
        </div>
        <USelect v-model="plan.range" :items="rangeItems" size="sm" class="w-44" aria-label="Time range" />
      </div>

      <ol class="mt-4 flex flex-col gap-2">
        <li v-for="(s, i) in plan.steps" :key="s.id" class="flex gap-3">
          <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--color-tide-100)] text-xs font-medium tabular-nums">{{ i + 1 }}</span>
          <div class="min-w-0">
            <p class="font-medium">
              {{ s.title }}
            </p>
            <p class="text-sm text-muted">
              {{ describeStep(s, plan.steps, templates) }}
            </p>
          </div>
        </li>
      </ol>

      <UAlert v-if="notes" class="mt-4" color="neutral" variant="subtle" icon="i-lucide-info" :title="notes" />

      <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="refine">
        <UInput v-model="change" maxlength="500" class="min-w-0 flex-1" placeholder="Change something, e.g. only the last hour, top 20, split by channel…" aria-label="Change the plan" />
        <UButton type="submit" color="neutral" variant="outline" icon="i-lucide-wand-sparkles" :loading="refining" :disabled="change.trim().length < 3">
          Update plan
        </UButton>
      </form>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <UButton icon="i-lucide-play" :loading="running" @click="run">
          {{ results ? 'Run again' : 'Run plan' }}
        </UButton>
        <UButton color="neutral" variant="ghost" @click="reset">
          New question
        </UButton>
        <span class="text-sm text-muted">Read-only, with your role's access and masking.</span>
      </div>
    </section>

    <UAlert v-if="errorMsg" class="mt-5" color="error" variant="subtle" :title="errorMsg" />
    <UAlert v-if="results && masked" class="mt-5" color="neutral" variant="subtle" icon="i-lucide-eye-off" title="IP addresses, email addresses and tokens are hidden for your role." />

    <template v-if="answer">
      <AiStepTable :result="answer" :page="page" :cell="cell" class="mt-6" highlight />
      <details v-if="earlier.length" class="mt-4">
        <summary class="cursor-pointer text-sm text-muted">
          Earlier steps ({{ earlier.length }})
        </summary>
        <AiStepTable v-for="r in earlier" :key="r.id" :result="r" :page="page" :cell="cell" class="mt-3" />
      </details>
    </template>
  </div>
</template>
