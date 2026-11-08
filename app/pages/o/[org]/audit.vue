<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useSeoMeta({ title: 'Audit log · LogsTrace' })

const { slug } = useOrgContext()
const { data: entries, error } = await useFetch(() => `/api/orgs/${slug.value}/audit`)

const labels: Record<string, string> = {
  'org.created': 'Created the organization',
  'org.updated': 'Changed organization settings',
  'member.role_changed': 'Changed a member\'s role',
  'member.removed': 'Removed a member',
  'member.left': 'Left the organization',
  'invite.created': 'Invited someone',
  'invite.revoked': 'Revoked an invitation',
  'invite.accepted': 'Joined from an invitation',
  'project.created': 'Created a project',
  'project.updated': 'Changed a project',
  'project.deleted': 'Deleted a project',
  'apikey.created': 'Created an API key',
  'apikey.revoked': 'Revoked an API key',
  'template.updated': 'Renamed a table or its columns'
}

function detail(meta: Record<string, unknown>) {
  const parts: string[] = []
  if (meta.email) parts.push(String(meta.email))
  if (meta.from && meta.to) parts.push(`${meta.from} to ${meta.to}`)
  if (meta.role) parts.push(String(meta.role))
  if (meta.name) parts.push(String(meta.name))
  if (meta.slug) parts.push(String(meta.slug))
  return parts.join(', ')
}
</script>

<template>
  <PagePanel title="Audit log" description="Who changed what in this organization. The newest 200 entries.">
    <UAlert v-if="error" color="neutral" variant="subtle" :title="apiErrorMessage(error)" />
    <div v-else class="overflow-x-auto rounded-lg border border-default bg-[var(--ui-bg-elevated)]">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-default text-muted">
            <th class="px-4 py-2.5 font-normal">
              When
            </th>
            <th class="px-4 py-2.5 font-normal">
              Who
            </th>
            <th class="px-4 py-2.5 font-normal">
              What
            </th>
            <th class="px-4 py-2.5 font-normal">
              IP
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id" class="border-b border-default/70 last:border-0 align-top">
            <td class="whitespace-nowrap px-4 py-2.5 text-muted">
              {{ new Date(e.createdAt).toLocaleString() }}
            </td>
            <td class="px-4 py-2.5">
              {{ e.userName ?? 'Deleted user' }}
            </td>
            <td class="px-4 py-2.5">
              {{ labels[e.action] ?? e.action }}
              <span v-if="detail(e.meta)" class="block text-muted">{{ detail(e.meta) }}</span>
            </td>
            <td class="log-line px-4 py-2.5 text-muted">
              {{ e.ip }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </PagePanel>
</template>
