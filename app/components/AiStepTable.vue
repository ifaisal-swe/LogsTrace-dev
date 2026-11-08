<script setup lang="ts">
defineProps<{
  result: StepResult
  page: string
  cell: (type: StepColumn['type'], v: string | number | null) => string
  highlight?: boolean
}>()
</script>

<template>
  <section class="overflow-hidden rounded-lg border bg-[var(--ui-bg-elevated)]" :class="highlight ? 'border-[var(--color-tide-400)]' : 'border-default'">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-2.5">
      <p class="font-medium">
        {{ result.title }}
        <span class="ml-1 text-sm font-normal text-muted">
          {{ result.rows.length.toLocaleString() }}{{ result.total !== null && result.total > result.rows.length ? ` of ${result.total.toLocaleString()}` : '' }} rows
        </span>
      </p>
      <NuxtLink v-if="result.tableId" :to="`${page}/templates/${result.tableId}`" class="text-sm text-primary">
        Open table
      </NuxtLink>
    </header>
    <p v-if="result.note" class="px-4 pt-2 text-sm text-muted">
      {{ result.note }}
    </p>
    <p v-if="!result.rows.length" class="px-4 py-6 text-center text-muted">
      Nothing matched.
    </p>
    <div v-else class="max-h-[28rem] overflow-auto">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-[var(--ui-bg-elevated)] text-left text-muted">
          <tr>
            <th v-for="c in result.columns" :key="c.key" scope="col" class="whitespace-nowrap px-4 py-2 font-medium" :class="c.type === 'number' ? 'text-right' : ''">
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="(r, i) in result.rows" :key="i">
            <td v-for="(c, j) in result.columns" :key="c.key" class="px-4 py-1.5 align-top" :class="[c.type === 'number' ? 'text-right tabular-nums' : '', c.type === 'time' ? 'whitespace-nowrap tabular-nums text-muted' : '', c.type === 'text' || c.type === 'id' ? 'log-line break-words' : '']">
              <UBadge v-if="c.type === 'level' && r[j]" :color="LEVEL_BADGE[r[j] as LogLevel] ?? 'neutral'" variant="subtle">
                {{ r[j] }}
              </UBadge>
              <template v-else>
                {{ cell(c.type, r[j] ?? null) }}
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
