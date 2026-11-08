<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useSeoMeta({ title: 'Sign in · LogsTrace' })

const route = useRoute()
const { refresh } = useAuth()
const notify = useNotify()
const state = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

function safeNext() {
  return safeRedirect(route.query.next, '/app/continue')
}

type SignedIn = { ok: true, needsVerification: boolean, recoveryCodesLeft?: number }
async function done(res: SignedIn) {
  await refresh()
  if (res.recoveryCodesLeft !== undefined && res.recoveryCodesLeft <= 3) {
    notify.error(`Only ${res.recoveryCodesLeft} recovery codes left. Create new ones in Account and security.`)
  }
  await navigateTo(res.needsVerification ? { path: '/verify-email', query: { next: safeNext() } } : safeNext())
}

// Second step, when the account has two-step sign-in on
const challenge = ref('')
const method = ref<'totp' | 'recovery'>('totp')
const pin = ref<string[]>([])
const recovery = ref('')

async function onSubmit(e: FormSubmitEvent<z.infer<typeof loginSchema>>) {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/auth/login', { method: 'POST', body: e.data })
    if ('needsTwoFactor' in res && res.needsTwoFactor) {
      challenge.value = res.challenge
      state.password = ''
      return
    }
    await done(res as SignedIn)
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    loading.value = false
  }
}

async function submitCode() {
  const code = method.value === 'totp' ? pin.value.join('') : recovery.value.trim()
  if (method.value === 'totp' ? code.length !== 6 : code.length < 10) return
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch<SignedIn>('/api/auth/two-factor', { method: 'POST', body: { challenge: challenge.value, method: method.value, code } })
    await done(res)
  } catch (err) {
    error.value = apiErrorMessage(err)
    pin.value = []
    // An expired challenge means starting over from the password
    if (/password again|too long/i.test(error.value)) challenge.value = ''
  } finally {
    loading.value = false
  }
}

function switchMethod() {
  method.value = method.value === 'totp' ? 'recovery' : 'totp'
  error.value = ''
}
</script>

<template>
  <div>
    <template v-if="!challenge">
      <h1 class="text-2xl font-semibold tracking-[-0.015em]">
        Sign in
      </h1>
      <p class="mt-2 text-muted">
        New here? <ULink to="/register" class="font-medium text-primary">Create an account</ULink>
      </p>

      <UAlert v-if="error" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

      <UForm :schema="loginSchema" :state="state" class="mt-6 flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="Email" name="email">
          <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Password" name="password">
          <template #hint>
            <ULink to="/forgot-password" class="text-sm text-muted hover:text-default">
              Forgot password?
            </ULink>
          </template>
          <UInput v-model="state.password" type="password" autocomplete="current-password" size="lg" class="w-full" />
        </UFormField>
        <UButton type="submit" size="lg" block :loading="loading">
          Sign in
        </UButton>
      </UForm>
    </template>

    <template v-else>
      <h1 class="text-2xl font-semibold tracking-[-0.015em]">
        Two-step sign-in
      </h1>
      <p class="mt-2 text-muted">
        {{ method === 'totp' ? 'Enter the 6-digit code from your authenticator app.' : 'Enter one of the recovery codes you saved when you turned on two-step sign-in.' }}
      </p>

      <UAlert v-if="error" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

      <form class="mt-6 flex flex-col gap-4" @submit.prevent="submitCode">
        <UPinInput v-if="method === 'totp'" v-model="pin" :length="6" otp size="xl" autofocus aria-label="Authenticator code" @complete="submitCode" />
        <UInput v-else v-model="recovery" placeholder="abcd-efgh-jkmn" size="lg" class="w-full" autocomplete="one-time-code" autofocus aria-label="Recovery code" />
        <UButton type="submit" size="lg" block :loading="loading">
          Verify and sign in
        </UButton>
      </form>
      <div class="mt-4 flex flex-col items-start gap-1 text-sm">
        <UButton variant="link" class="px-0" @click="switchMethod">
          {{ method === 'totp' ? 'Use a recovery code instead' : 'Use the authenticator app instead' }}
        </UButton>
        <UButton variant="link" color="neutral" class="px-0" @click="challenge = ''; error = ''">
          Sign in with a different account
        </UButton>
      </div>
    </template>
  </div>
</template>
