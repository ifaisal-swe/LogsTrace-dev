<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: 'auth' })
useSeoMeta({ title: 'Verify email · LogsTrace' })

const route = useRoute()
const { user, refresh, logout } = useAuth()
const next = safeRedirect(route.query.next)
const optional = route.query.optional === '1'

const code = ref<string[]>([])
const error = ref('')
const verifying = ref(false)
const sending = ref(false)
const cooldown = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

function startCooldown(seconds = 60) {
  cooldown.value = seconds
  clearInterval(timer)
  timer = setInterval(() => { if (--cooldown.value <= 0) clearInterval(timer) }, 1000)
}
onMounted(() => {
  if (user.value?.emailVerified) navigateTo(next)
  // Registration already sent the first code; arriving from sign-in or a banner sends one now
  else if (route.query.sent === '1') startCooldown()
  else resend()
})
// The emailed link may be opened in another tab or device
async function onFocus() {
  await refresh().catch(() => {})
  if (user.value?.emailVerified) navigateTo(next)
}
onMounted(() => window.addEventListener('focus', onFocus))
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('focus', onFocus)
})

async function verify() {
  const value = code.value.join('')
  if (value.length !== 6) return
  verifying.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/verify-email', { method: 'POST', body: { code: value } })
    await refresh()
    await navigateTo(next)
  } catch (err) {
    error.value = apiErrorMessage(err)
    code.value = []
  } finally {
    verifying.value = false
  }
}

async function resend() {
  sending.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/resend-verification', { method: 'POST' })
    startCooldown()
  } catch (err) {
    error.value = apiErrorMessage(err)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <UIcon name="i-lucide-mail-check" class="size-8 text-primary" />
    <h1 class="mt-4 text-2xl font-semibold tracking-[-0.015em]">
      Check your email
    </h1>
    <p class="mt-2 leading-relaxed text-muted">
      Enter the 6-digit code we sent to <span class="font-medium text-default">{{ user?.email }}</span>, or click the link in that email.
    </p>

    <UAlert v-if="error" class="mt-6" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />

    <form class="mt-6" @submit.prevent="verify">
      <UPinInput v-model="code" :length="6" otp size="xl" autofocus aria-label="Verification code" @complete="verify" />
      <UButton type="submit" size="lg" block class="mt-5" :loading="verifying" :disabled="code.join('').length !== 6">
        Verify email
      </UButton>
    </form>

    <div class="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
      <UButton variant="link" color="neutral" class="px-0" :loading="sending" :disabled="cooldown > 0" @click="resend">
        {{ cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code' }}
      </UButton>
      <UButton v-if="optional" variant="link" color="neutral" class="px-0" :to="next">
        Skip for now
      </UButton>
      <UButton v-else variant="link" color="neutral" class="px-0" @click="logout">
        Use another account
      </UButton>
    </div>
  </div>
</template>
