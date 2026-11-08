<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Platform users · LogsTrace' })

const { user: me } = useAuth()
const notify = useNotify()
const q = ref('')
const query = useDebounced(q, 300)
const { data: users, refresh } = await useFetch('/api/admin/users', { query: { q: query } })

async function update(id: string, body: Record<string, unknown>, done: string) {
  try {
    await $fetch(`/api/admin/users/${id}`, { method: 'PATCH', body })
    notify.success(done)
    await refresh()
  } catch (err) { notify.error(err) }
}

async function signOutEverywhere(id: string) {
  try {
    await $fetch(`/api/admin/users/${id}/sessions`, { method: 'DELETE' })
    notify.success('Signed out of every device')
  } catch (err) { notify.error(err) }
}

function menu(u: NonNullable<typeof users.value>[number]) {
  const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date()
  return [[
    u.platformRole === 'admin'
      ? { label: 'Remove platform admin', icon: 'i-lucide-shield-off', disabled: u.id === me.value?.id, onSelect: () => update(u.id, { platformRole: 'user' }, 'Admin removed') }
      : { label: 'Make platform admin', icon: 'i-lucide-shield', onSelect: () => update(u.id, { platformRole: 'admin' }, 'Now a platform admin') },
    ...(u.platformRole === 'user' ? [{ label: 'Make support moderator', icon: 'i-lucide-life-buoy', onSelect: () => update(u.id, { platformRole: 'moderator' }, 'Now a support moderator') }] : []),
    ...(u.platformRole === 'moderator' ? [{ label: 'Remove support moderator', icon: 'i-lucide-life-buoy', onSelect: () => update(u.id, { platformRole: 'user' }, 'Moderator removed') }] : []),
    ...(!u.emailVerifiedAt ? [{ label: 'Mark email verified', icon: 'i-lucide-mail-check', onSelect: () => update(u.id, { verifyEmail: true }, 'Email marked verified') }] : []),
    ...(locked ? [{ label: 'Unlock sign-in', icon: 'i-lucide-lock-open', onSelect: () => update(u.id, { unlock: true }, 'Account unlocked') }] : []),
    ...(u.totpEnabledAt ? [{ label: 'Reset two-step sign-in', icon: 'i-lucide-smartphone', onSelect: () => update(u.id, { resetTwoFactor: true }, 'Two-step sign-in reset. They sign in with the password now.') }] : []),
    { label: 'Sign out everywhere', icon: 'i-lucide-log-out', onSelect: () => signOutEverywhere(u.id) }
  ], [
    u.disabledAt
      ? { label: 'Enable account', icon: 'i-lucide-user-check', onSelect: () => update(u.id, { disabled: false }, 'Account enabled') }
      : { label: 'Disable account', icon: 'i-lucide-user-x', color: 'error' as const, disabled: u.id === me.value?.id, onSelect: () => update(u.id, { disabled: true }, 'Account disabled and signed out') }
  ]]
}
</script>

<template>
  <PagePanel title="Platform users" description="Everyone with an account. Platform admins can manage accounts but don't automatically see an organization's logs.">
    <UInput v-model="q" icon="i-lucide-search" placeholder="Search by name or email" class="mb-5 w-full max-w-sm" />
    <div class="overflow-x-auto rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-default text-muted">
            <th class="px-4 py-2.5 font-normal">
              Name
            </th>
            <th class="px-4 py-2.5 font-normal">
              Status
            </th>
            <th class="px-4 py-2.5 font-normal">
              Joined
            </th>
            <th class="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" class="border-b border-default/70 last:border-0">
            <td class="px-4 py-3">
              <p class="font-medium">
                {{ u.name }}
              </p>
              <p class="text-muted">
                {{ u.email }}
              </p>
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1.5">
                <UBadge v-if="u.platformRole === 'admin'" color="primary" variant="subtle">
                  Platform admin
                </UBadge>
                <UBadge v-else-if="u.platformRole === 'moderator'" color="info" variant="subtle">
                  Support moderator
                </UBadge>
                <UBadge v-if="u.disabledAt" color="error" variant="subtle">
                  Disabled
                </UBadge>
                <UBadge v-if="u.lockedUntil && new Date(u.lockedUntil) > new Date()" color="warning" variant="subtle">
                  Locked
                </UBadge>
                <UBadge v-if="!u.emailVerifiedAt" color="neutral" variant="subtle">
                  Unverified
                </UBadge>
              </div>
            </td>
            <td class="px-4 py-3 text-muted">
              {{ new Date(u.createdAt).toLocaleDateString() }}
            </td>
            <td class="px-4 py-3 text-end">
              <UDropdownMenu :items="menu(u)" :content="{ align: 'end' }">
                <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="`Actions for ${u.name}`" />
              </UDropdownMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </PagePanel>
</template>
