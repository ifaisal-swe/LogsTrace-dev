<script setup lang="ts">
import { ROLE_LABELS } from '#shared/utils/permissions'
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Invitation · LogsTrace' })

const route = useRoute()
const token = String(route.params.token)
const { user, loaded, refresh } = useAuth()
if (!loaded.value) await refresh()

const { data: invite, error } = await useFetch(`/api/invites/${token}`)
const accepting = ref(false)
const acceptError = ref('')

async function accept() {
  accepting.value = true
  acceptError.value = ''
  try {
    const res = await $fetch(`/api/invites/${token}/accept`, { method: 'POST' })
    await refresh()
    await navigateTo(`/o/${res.orgSlug}`)
  } catch (err) {
    acceptError.value = apiErrorMessage(err)
  } finally {
    accepting.value = false
  }
}
</script>

<template>
  <div>
    <template v-if="error || !invite">
      <h1 class="text-2xl font-semibold tracking-[-0.015em]">
        Invitation not available
      </h1>
      <p class="mt-3 text-muted">
        This invitation has expired or was already used. Ask the person who invited you to send a new one.
      </p>
    </template>
    <template v-else>
      <h1 class="text-2xl font-semibold tracking-[-0.015em]">
        Join {{ invite.orgName }}
      </h1>
      <p class="mt-3 leading-relaxed text-muted">
        You're invited as <span class="font-medium text-default">{{ ROLE_LABELS[invite.role].label }}</span>.
        {{ ROLE_LABELS[invite.role].description }}
      </p>
      <UAlert v-if="acceptError" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="acceptError" />
      <div class="mt-6">
        <UButton v-if="user" size="lg" :loading="accepting" @click="accept">
          Join {{ invite.orgName }}
        </UButton>
        <div v-else class="flex flex-col gap-3">
          <p class="text-sm text-muted">
            Sign in or create an account with <span class="font-medium text-default">{{ invite.email }}</span> to accept.
          </p>
          <div class="flex gap-3">
            <UButton :to="{ path: '/login', query: { next: route.fullPath } }">
              Sign in
            </UButton>
            <UButton :to="{ path: '/register', query: { next: route.fullPath } }" variant="outline" color="neutral">
              Create account
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
