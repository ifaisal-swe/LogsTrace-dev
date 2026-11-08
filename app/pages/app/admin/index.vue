<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'owner'] })
useSeoMeta({ title: 'Owner dashboard · LogsTrace' })

const { data, refresh, status } = await useFetch('/api/admin/overview')
const fmt = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString()

// Heavier full scans, so only on demand
const { data: storage, execute: checkStorage, status: storageStatus, error: storageError } = useFetch('/api/admin/storage', { immediate: false, server: false })
const bytes = (n: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[i]}`
}
const storageFacts = computed(() => {
  const s = storage.value
  if (!s) return []
  const c = s.clickhouse
  return [
    { label: 'ClickHouse', value: c.ok ? `Connected · v${c.version}` : 'Not reachable', hint: `Database ${c.database}` },
    { label: 'Messages in ClickHouse', value: c.ok ? fmt(c.rows) : '—', hint: c.ok ? `${bytes(c.bytes)} on disk · ${fmt(c.parts)} parts` : '' },
    { label: 'Time range', value: c.ok && c.oldest ? new Date(c.oldest).toLocaleDateString() : '—', hint: c.ok && c.newest ? `Newest ${new Date(c.newest).toLocaleString()}` : '' },
    { label: 'Highest id', value: c.ok ? fmt(c.maxId) : '—', hint: `Postgres id sequence at ${fmt(s.sequenceLastId)}` },
    { label: 'Old Postgres copy', value: s.legacy ? fmt(s.legacy.rows) : 'Dropped', hint: s.legacy ? `Highest id ${fmt(s.legacy.maxId)} · read-only backup, not used` : 'Nothing left in Postgres' },
    { label: 'Reads and writes go to', value: 'ClickHouse only', hint: 'Postgres only hands out log ids' }
  ]
})

const tiles = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: 'Users', value: fmt(d.users!.total), hint: `${fmt(d.users!.lastWeek)} new this week` },
    { label: 'Active users (7 days)', value: fmt(d.activeUsersWeek), hint: `${fmt(d.users!.verified)} verified` },
    { label: 'Organizations', value: fmt(d.orgs), hint: `${fmt(d.projects)} projects` },
    { label: 'Messages stored', value: fmt(d.logs), hint: d.logs == null ? 'ClickHouse unavailable' : 'All projects' },
    { label: 'Active API keys', value: fmt(d.activeKeys), hint: 'Not revoked' },
    { label: 'Open tickets', value: fmt(d.openTickets), hint: `${fmt(d.users!.disabled)} disabled accounts · ${fmt(d.users!.twoFactor)} with 2FA` }
  ]
})
</script>

<template>
  <PagePanel title="Owner dashboard" description="Platform-wide numbers. Only accounts listed in the owner email setting can open this page.">
    <template #actions>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" aria-label="Refresh" @click="refresh()" />
    </template>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="t in tiles" :key="t.label" class="rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4">
        <p class="text-sm text-muted">
          {{ t.label }}
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">
          {{ t.value }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ t.hint }}
        </p>
      </div>
    </div>

    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-medium">
            Newest accounts
          </h2>
          <UButton to="/app/admin/users" label="All users" size="xs" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right" />
        </div>
        <ul class="divide-y divide-default/70 rounded-lg border border-default bg-[var(--ui-bg-elevated)] text-sm">
          <li v-for="u in data?.recentUsers" :key="u.id" class="flex items-center justify-between gap-3 px-4 py-2.5">
            <div class="min-w-0">
              <p class="truncate font-medium">
                {{ u.name }}
              </p>
              <p class="truncate text-muted">
                {{ u.email }}
              </p>
            </div>
            <div class="shrink-0 text-right text-xs text-muted">
              <UBadge v-if="!u.emailVerifiedAt" color="warning" variant="subtle" size="sm">
                Unverified
              </UBadge>
              <p>{{ new Date(u.createdAt).toLocaleDateString() }}</p>
            </div>
          </li>
        </ul>
      </section>

      <section>
        <h2 class="mb-3 font-medium">
          Recent activity
        </h2>
        <ul class="divide-y divide-default/70 rounded-lg border border-default bg-[var(--ui-bg-elevated)] text-sm">
          <li v-for="e in data?.recentEvents" :key="e.id" class="flex items-center justify-between gap-3 px-4 py-2.5">
            <div class="min-w-0">
              <p class="truncate font-mono text-xs">
                {{ e.action }}
              </p>
              <p class="truncate text-muted">
                {{ e.email ?? 'System' }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-muted">{{ new Date(e.createdAt).toLocaleString() }}</span>
          </li>
          <li v-if="!data?.recentEvents?.length" class="px-4 py-2.5 text-muted">
            No activity yet.
          </li>
        </ul>
      </section>
    </div>

    <section class="mt-8">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 class="font-medium">
            Log storage
          </h2>
          <p class="text-sm text-muted">
            Where log data comes from. The check counts every message in ClickHouse and in the old Postgres copy.
          </p>
        </div>
        <UButton icon="i-lucide-database-zap" :label="storage ? 'Check again' : 'Run check'" :loading="storageStatus === 'pending'" @click="checkStorage()" />
      </div>

      <UAlert v-if="storageError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="storageError.statusMessage || 'The check failed'" />
      <template v-else-if="storage">
        <UAlert
          v-if="storage.allInClickHouse"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          title="All logs are in ClickHouse"
          :description="storage.legacy ? 'Every project has at least as many messages in ClickHouse as in the old Postgres copy.' : 'The old Postgres copy is gone; ClickHouse is the only store.'"
        />
        <UAlert
          v-else
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="storage.clickhouse.ok ? 'Some projects have fewer messages in ClickHouse' : 'ClickHouse is not reachable'"
          :description="storage.clickhouse.ok ? 'Rows marked below are short. Retention can explain it (it only deletes from ClickHouse); otherwise rerun npm run ch:backfill.' : 'Check NUXT_CLICKHOUSE_URL and that the server is running.'"
        />

        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="f in storageFacts" :key="f.label" class="rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-4">
            <p class="text-sm text-muted">
              {{ f.label }}
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums">
              {{ f.value }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ f.hint }}
            </p>
          </div>
        </div>

        <div v-if="storage.projects.length" class="mt-4 overflow-x-auto rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-default text-muted">
                <th class="px-4 py-2.5 font-normal">
                  Project
                </th>
                <th class="px-4 py-2.5 text-right font-normal">
                  ClickHouse
                </th>
                <th v-if="storage.legacy" class="px-4 py-2.5 text-right font-normal">
                  Old Postgres copy
                </th>
                <th v-if="storage.legacy" class="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in storage.projects" :key="p.id" class="border-b border-default/70 last:border-0">
                <td class="px-4 py-2.5">
                  <p class="font-medium">
                    {{ p.name }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ p.org }}
                  </p>
                </td>
                <td class="px-4 py-2.5 text-right tabular-nums">
                  {{ fmt(p.clickhouse) }}
                </td>
                <td v-if="storage.legacy" class="px-4 py-2.5 text-right tabular-nums">
                  {{ fmt(p.postgres) }}
                </td>
                <td v-if="storage.legacy" class="px-4 py-2.5 text-right">
                  <UBadge v-if="p.postgres != null && p.clickhouse < p.postgres" color="warning" variant="subtle" size="sm">
                    {{ fmt(p.postgres - p.clickhouse) }} short
                  </UBadge>
                  <UIcon v-else name="i-lucide-check" class="text-success" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-xs text-muted">
          Checked {{ new Date(storage.checkedAt).toLocaleString() }}
        </p>
      </template>
    </section>
  </PagePanel>
</template>
