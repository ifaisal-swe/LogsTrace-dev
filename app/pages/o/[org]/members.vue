<script setup lang="ts">
import { ROLE_LABELS } from '#shared/utils/permissions'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Members · LogsTrace' })

const { slug, ctx, can } = useOrgContext()
const { user, refresh: refreshMe } = useAuth()
const notify = useNotify()

const { data: members, refresh } = await useFetch(() => `/api/orgs/${slug.value}/members`)
const { data: invites, refresh: refreshInvites } = await useFetch(() => `/api/orgs/${slug.value}/invites`, { immediate: false })
watch(() => ctx.value?.permissions, () => { if (can('members:manage')) refreshInvites() }, { immediate: true })

const myRole = computed(() => ctx.value?.role)
// The only owner can't leave (the server refuses), so don't offer it
const onlyOwner = computed(() => myRole.value === 'owner' && (members.value ?? []).filter(m => m.role === 'owner').length <= 1)
const roleItems = computed(() => ORG_ROLES
  .filter(r => myRole.value && canManageRole(myRole.value, r))
  .map(r => ({ label: ROLE_LABELS[r].label, value: r })))

async function changeRole(userId: string, role: OrgRole) {
  try {
    await $fetch(`/api/orgs/${slug.value}/members/${userId}`, { method: 'PATCH', body: { role } })
    notify.success('Role changed')
  } catch (err) { notify.error(err) } finally { await refresh() }
}

async function remove(userId: string) {
  const leaving = userId === user.value?.id
  try {
    await $fetch(`/api/orgs/${slug.value}/members/${userId}`, { method: 'DELETE' })
    if (leaving) {
      await refreshMe()
      notify.success('You left the organization')
      return navigateTo('/app')
    }
    notify.success('Member removed')
    await refresh()
  } catch (err) { notify.error(err) }
}

const invite = reactive<{ email: string, role: 'admin' | 'member' | 'viewer' }>({ email: '', role: 'member' })
const inviting = ref(false)
const lastLink = ref('')
const inviteRoleItems = computed(() => (['admin', 'member', 'viewer'] as const)
  .filter(r => myRole.value && canManageRole(myRole.value, r))
  .map(r => ({ label: ROLE_LABELS[r].label, value: r })))

async function sendInvite(e: FormSubmitEvent<z.infer<typeof inviteSchema>>) {
  inviting.value = true
  try {
    const res = await $fetch(`/api/orgs/${slug.value}/invites`, { method: 'POST', body: e.data })
    lastLink.value = res.link
    invite.email = ''
    notify.success('Invitation created')
    await refreshInvites()
  } catch (err) { notify.error(err) } finally { inviting.value = false }
}

async function revokeInvite(id: string) {
  try {
    await $fetch(`/api/orgs/${slug.value}/invites/${id}`, { method: 'DELETE' })
    notify.success('Invitation revoked')
    await refreshInvites()
  } catch (err) { notify.error(err) }
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  notify.success('Link copied')
}
</script>

<template>
  <PagePanel title="Members" description="People in this organization and what their role lets them do.">
    <div class="overflow-x-auto rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
      <table class="w-full text-left text-sm">
        <tbody>
          <tr v-for="m in members" :key="m.userId" class="border-b border-default/70 last:border-0">
            <td class="px-4 py-3">
              <p class="font-medium">
                {{ m.name }}<span v-if="m.userId === user?.id" class="font-normal text-muted"> (you)</span>
              </p>
              <p class="text-muted">
                {{ m.email }}
              </p>
            </td>
            <td class="w-48 px-4 py-3">
              <USelect
                v-if="can('members:manage') && m.userId !== user?.id && myRole && canManageRole(myRole, m.role)"
                :model-value="m.role"
                :items="roleItems"
                class="w-full"
                :aria-label="`Role for ${m.name}`"
                @update:model-value="(r: OrgRole) => changeRole(m.userId, r)"
              />
              <span v-else>{{ ROLE_LABELS[m.role].label }}</span>
            </td>
            <td class="w-32 px-4 py-3 text-end">
              <UButton
                v-if="m.userId === user?.id && !onlyOwner"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="remove(m.userId)"
              >
                Leave
              </UButton>
              <UButton
                v-else-if="can('members:manage') && myRole && canManageRole(myRole, m.role)"
                color="error"
                variant="ghost"
                size="sm"
                @click="remove(m.userId)"
              >
                Remove
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section v-if="can('members:manage')" class="mt-10 grid gap-8 lg:grid-cols-2">
      <div>
        <h2 class="text-lg font-medium">
          Invite someone
        </h2>
        <p class="mt-1 text-sm text-muted">
          They'll join with the role you pick. Links work for 7 days.
        </p>
        <UForm :schema="inviteSchema" :state="invite" class="mt-4 flex flex-col gap-4" @submit="sendInvite">
          <UFormField label="Email" name="email">
            <UInput v-model="invite.email" type="email" class="w-full" />
          </UFormField>
          <UFormField label="Role" name="role" :help="ROLE_LABELS[invite.role].description">
            <USelect v-model="invite.role" :items="inviteRoleItems" class="w-full" />
          </UFormField>
          <div>
            <UButton type="submit" :loading="inviting">
              Create invitation
            </UButton>
          </div>
        </UForm>
        <div v-if="lastLink" class="mt-5 rounded-lg border border-default bg-[var(--ui-bg-muted)] p-4">
          <p class="text-sm text-muted">
            Share this link with them. It's only shown once.
          </p>
          <div class="mt-2 flex items-center gap-2">
            <code class="log-line min-w-0 flex-1 truncate text-sm">{{ lastLink }}</code>
            <UButton icon="i-lucide-copy" color="neutral" variant="outline" size="sm" aria-label="Copy link" @click="copy(lastLink)" />
          </div>
        </div>
      </div>
      <div>
        <h2 class="text-lg font-medium">
          Pending invitations
        </h2>
        <p v-if="!invites?.length" class="mt-2 text-sm text-muted">
          None right now.
        </p>
        <ul v-else class="mt-4 divide-y divide-default rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
          <li v-for="i in invites" :key="i.id" class="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              <span class="block font-medium">{{ i.email }}</span>
              <span class="text-muted">{{ ROLE_LABELS[i.role].label }}, expires {{ new Date(i.expiresAt).toLocaleDateString() }}</span>
            </span>
            <UButton color="neutral" variant="ghost" size="sm" @click="revokeInvite(i.id)">
              Revoke
            </UButton>
          </li>
        </ul>
      </div>
    </section>
  </PagePanel>
</template>
