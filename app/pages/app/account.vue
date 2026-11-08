<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Account and security · LogsTrace' })

const { user, refresh } = useAuth()
const notify = useNotify()

const profile = reactive({ name: user.value?.name ?? '' })
const savingProfile = ref(false)
async function saveProfile(e: FormSubmitEvent<z.infer<typeof profileSchema>>) {
  savingProfile.value = true
  try {
    await $fetch('/api/account/profile', { method: 'PATCH', body: e.data })
    await refresh()
    notify.success('Name saved')
  } catch (err) { notify.error(err) } finally { savingProfile.value = false }
}

const pw = reactive({ currentPassword: '', newPassword: '' })
const savingPw = ref(false)
async function changePassword(e: FormSubmitEvent<z.infer<typeof changePasswordSchema>>) {
  savingPw.value = true
  try {
    await $fetch('/api/account/password', { method: 'POST', body: e.data })
    pw.currentPassword = ''
    pw.newPassword = ''
    notify.success('Password changed', 'Other devices were signed out.')
    await Promise.all([refreshSessions(), refreshActivity()])
  } catch (err) { notify.error(err) } finally { savingPw.value = false }
}

const { data: sessions, refresh: refreshSessions } = await useFetch('/api/account/sessions')
const { data: activity, refresh: refreshActivity } = await useFetch('/api/account/activity')

async function revoke(id: string, current: boolean) {
  try {
    await $fetch(`/api/account/sessions/${id}`, { method: 'DELETE' })
    if (current) return navigateTo('/login')
    notify.success('Device signed out')
    await Promise.all([refreshSessions(), refreshActivity()])
  } catch (err) { notify.error(err) }
}

async function revokeOthers() {
  try {
    await $fetch('/api/account/sessions/others', { method: 'DELETE' })
    notify.success('Signed out of all other devices')
    await Promise.all([refreshSessions(), refreshActivity()])
  } catch (err) { notify.error(err) }
}

function device(ua: string | null) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

const actionLabels: Record<string, string> = {
  'auth.register': 'Account created',
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.login_failed': 'Failed sign-in',
  'auth.account_locked': 'Locked after failed sign-ins',
  'auth.password_changed': 'Password changed',
  'auth.password_change_failed': 'Wrong current password',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset': 'Password reset',
  'auth.email_verified': 'Email verified',
  'auth.session_revoked': 'Device signed out',
  'auth.sessions_revoked_others': 'Other devices signed out'
}
const fmt = (d: string | Date) => new Date(d).toLocaleString()
</script>

<template>
  <PagePanel title="Account and security">
    <div class="grid gap-12">
      <section class="grid gap-6 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 class="font-medium">
            Profile
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ user?.email }}
          </p>
        </div>
        <UForm :schema="profileSchema" :state="profile" class="flex max-w-md flex-col gap-4" @submit="saveProfile">
          <UFormField label="Name" name="name">
            <UInput v-model="profile.name" class="w-full" />
          </UFormField>
          <div>
            <UButton type="submit" :loading="savingProfile">
              Save name
            </UButton>
          </div>
        </UForm>
      </section>

      <section class="grid gap-6 border-t border-default pt-10 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 class="font-medium">
            Password
          </h2>
          <p class="mt-1 text-sm text-muted">
            Changing it signs out your other devices.
          </p>
        </div>
        <UForm :schema="changePasswordSchema" :state="pw" class="flex max-w-md flex-col gap-4" @submit="changePassword">
          <UFormField label="Current password" name="currentPassword">
            <UInput v-model="pw.currentPassword" type="password" autocomplete="current-password" class="w-full" />
          </UFormField>
          <UFormField label="New password" name="newPassword" help="At least 10 characters, with letters and numbers.">
            <UInput v-model="pw.newPassword" type="password" autocomplete="new-password" class="w-full" />
          </UFormField>
          <div>
            <UButton type="submit" :loading="savingPw">
              Change password
            </UButton>
          </div>
        </UForm>
      </section>

      <section class="grid gap-6 border-t border-default pt-10 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 class="font-medium">
            Two-step sign-in
          </h2>
          <p class="mt-1 text-sm text-muted">
            A second check after your password, so a leaked password alone can't open your account.
          </p>
        </div>
        <SecuritySettings />
      </section>

      <section class="grid gap-6 border-t border-default pt-10 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 class="font-medium">
            Signed-in devices
          </h2>
          <p class="mt-1 text-sm text-muted">
            Sign out anything you don't recognise.
          </p>
        </div>
        <div>
          <ul class="divide-y divide-default rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
            <li v-for="s in sessions" :key="s.id" class="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p class="font-medium">
                  {{ device(s.userAgent) }}
                  <UBadge v-if="s.current" color="primary" variant="subtle" size="sm" class="ms-2">
                    This device
                  </UBadge>
                </p>
                <p class="text-sm text-muted">
                  {{ s.ip }}, last active {{ fmt(s.lastSeenAt) }}
                </p>
              </div>
              <UButton color="neutral" variant="outline" size="sm" @click="revoke(s.id, s.current)">
                Sign out
              </UButton>
            </li>
          </ul>
          <UButton v-if="(sessions?.length ?? 0) > 1" class="mt-4" color="neutral" variant="outline" @click="revokeOthers">
            Sign out all other devices
          </UButton>
        </div>
      </section>

      <section class="grid gap-6 border-t border-default pt-10 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 class="font-medium">
            Recent security activity
          </h2>
          <p class="mt-1 text-sm text-muted">
            The last 50 sign-in and password events.
          </p>
        </div>
        <table class="w-full text-left text-sm">
          <tbody>
            <tr v-for="a in activity" :key="a.id" class="border-b border-default/70">
              <td class="py-2 pe-4" :class="a.action.includes('failed') || a.action.includes('locked') ? 'text-error' : ''">
                {{ actionLabels[a.action] ?? a.action }}
              </td>
              <td class="py-2 pe-4 text-muted">
                {{ a.ip }}
              </td>
              <td class="py-2 text-muted">
                {{ fmt(a.createdAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </PagePanel>
</template>
