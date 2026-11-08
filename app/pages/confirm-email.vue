<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Confirm email · LogsTrace' })

const route = useRoute()
const { user, refresh } = useAuth()
const token = String(route.query.token ?? '')
const status = ref<'working' | 'done' | 'error'>(token ? 'working' : 'error')
const error = ref(token ? '' : 'This link is missing its token. Open the link from the email again.')

// POST from the page, not a GET link, so mail scanners that only fetch the URL don't use it up
onMounted(async () => {
  if (!token) return
  try {
    await $fetch('/api/auth/verify-email-link', { method: 'POST', body: { token } })
    status.value = 'done'
  } catch (err) {
    error.value = apiErrorMessage(err)
    status.value = 'error'
  }
  await refresh().catch(() => {})
})
</script>

<template>
  <div>
    <UIcon :name="status === 'error' ? 'i-lucide-mail-x' : 'i-lucide-mail-check'" class="size-8" :class="status === 'error' ? 'text-error' : 'text-primary'" />
    <h1 class="mt-4 text-2xl font-semibold tracking-[-0.015em]">
      {{ status === 'done' ? 'Email confirmed' : status === 'error' ? 'Couldn\'t confirm email' : 'Confirming your email…' }}
    </h1>

    <p v-if="status === 'done'" class="mt-2 leading-relaxed text-muted">
      Your email address is confirmed.
    </p>
    <UAlert v-if="status === 'error'" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

    <UButton v-if="status !== 'working'" :to="user ? (user.emailVerified ? '/app' : '/verify-email') : '/login'" size="lg" class="mt-6">
      {{ user ? (user.emailVerified ? 'Continue' : 'Enter a code instead') : 'Sign in' }}
    </UButton>
  </div>
</template>
