<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useSeoMeta({ title: 'Create account · LogsTrace' })

const { refresh } = useAuth()
const state = reactive({ name: '', email: '', password: '', confirmPassword: '' })
const error = ref('')
const loading = ref(false)

async function onSubmit(e: FormSubmitEvent<z.infer<typeof registerFormSchema>>) {
  loading.value = true
  error.value = ''
  try {
    // Invite-only servers accept sign-ups that come from an invitation link
    const invite = /^\/invite\/([^/?#]+)/.exec(String(useRoute().query.next ?? ''))?.[1]
    const res = await $fetch('/api/auth/register', { method: 'POST', body: { name: e.data.name, email: e.data.email, password: e.data.password, invite } })
    await refresh()
    const next = safeRedirect(useRoute().query.next)
    // Always confirm the address once; when verification is optional the page offers "skip for now"
    await navigateTo({ path: '/verify-email', query: { next, sent: '1', optional: res.needsVerification ? undefined : '1' } })
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-[-0.015em]">
      Create your account
    </h1>
    <p class="mt-2 text-muted">
      Already have one? <ULink to="/login" class="font-medium text-primary">Sign in</ULink>
    </p>

    <UAlert v-if="error" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

    <UForm :schema="registerFormSchema" :state="state" class="mt-6 flex flex-col gap-4" @submit="onSubmit">
      <UFormField label="Name" name="name">
        <UInput v-model="state.name" autocomplete="name" size="lg" class="w-full" autofocus />
      </UFormField>
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="Password" name="password" help="At least 10 characters, with letters and numbers.">
        <UInput v-model="state.password" type="password" autocomplete="new-password" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="Confirm password" name="confirmPassword">
        <UInput v-model="state.confirmPassword" type="password" autocomplete="new-password" size="lg" class="w-full" />
      </UFormField>
      <UButton type="submit" size="lg" block :loading="loading">
        Create account
      </UButton>
    </UForm>
  </div>
</template>
