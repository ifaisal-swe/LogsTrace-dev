<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useSeoMeta({ title: 'Reset password · LogsTrace' })

const state = reactive({ email: '' })
const sent = ref(false)
const error = ref('')
const loading = ref(false)

async function onSubmit(e: FormSubmitEvent<z.infer<typeof forgotSchema>>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/forgot-password', { method: 'POST', body: e.data })
    sent.value = true
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
      Reset your password
    </h1>
    <template v-if="sent">
      <p class="mt-3 leading-relaxed text-muted">
        If an account exists for <span class="font-medium text-default">{{ state.email }}</span>, a reset link is on its way.
        The link works for 30 minutes.
      </p>
      <UButton to="/login" class="mt-6" variant="outline" color="neutral">
        Back to sign in
      </UButton>
    </template>
    <template v-else>
      <p class="mt-2 text-muted">
        Enter your account email and we'll send you a link to choose a new password.
      </p>
      <UAlert v-if="error" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      <UForm :schema="forgotSchema" :state="state" class="mt-6 flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="Email" name="email">
          <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" autofocus />
        </UFormField>
        <UButton type="submit" size="lg" block :loading="loading">
          Send reset link
        </UButton>
      </UForm>
      <p class="mt-6 text-sm">
        <ULink to="/login" class="text-muted hover:text-default">
          Back to sign in
        </ULink>
      </p>
    </template>
  </div>
</template>
