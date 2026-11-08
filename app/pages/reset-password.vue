<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Choose a new password · LogsTrace' })

const route = useRoute()
const token = String(route.query.token ?? '')
const schema = z.object({ password: passwordSchema })
const state = reactive({ password: '' })
const done = ref(false)
const error = ref(token ? '' : 'This link is missing its token. Open the link from the email again.')
const loading = ref(false)

async function onSubmit(e: FormSubmitEvent<z.infer<typeof schema>>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset-password', { method: 'POST', body: { token, password: e.data.password } })
    done.value = true
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
      Choose a new password
    </h1>
    <template v-if="done">
      <p class="mt-3 leading-relaxed text-muted">
        Password changed. Every device that was signed in has been signed out.
      </p>
      <UButton to="/login" class="mt-6">
        Sign in
      </UButton>
    </template>
    <template v-else>
      <UAlert v-if="error" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      <UForm v-if="token" :schema="schema" :state="state" class="mt-6 flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="New password" name="password" help="At least 10 characters, with letters and numbers.">
          <UInput v-model="state.password" type="password" autocomplete="new-password" size="lg" class="w-full" autofocus />
        </UFormField>
        <UButton type="submit" size="lg" block :loading="loading">
          Change password
        </UButton>
      </UForm>
      <p class="mt-6 text-sm">
        <ULink to="/forgot-password" class="text-muted hover:text-default">
          Request a new link
        </ULink>
      </p>
    </template>
  </div>
</template>
