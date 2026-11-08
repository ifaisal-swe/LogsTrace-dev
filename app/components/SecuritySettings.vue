<script setup lang="ts">
type Security = { totpEnabledAt: string | null, recoveryCodesLeft: number, loginAlerts: boolean }

const notify = useNotify()
const { data, refresh } = await useFetch<Security>('/api/account/security')

// Turning on: password → scan QR → confirm a code → save recovery codes
const step = ref<'idle' | 'password' | 'scan' | 'codes'>('idle')
const password = ref('')
const setup = ref<{ secret: string, uri: string } | null>(null)
const pin = ref<string[]>([])
const codes = ref<string[]>([])
const busy = ref(false)
const showSecret = ref(false)

async function startSetup() {
  busy.value = true
  try {
    setup.value = await $fetch('/api/account/2fa/setup', { method: 'POST', body: { password: password.value } })
    password.value = ''
    step.value = 'scan'
  } catch (err) { notify.error(err) } finally { busy.value = false }
}

async function confirmSetup() {
  if (pin.value.join('').length !== 6) return
  busy.value = true
  try {
    const res = await $fetch<{ recoveryCodes: string[] }>('/api/account/2fa/enable', { method: 'POST', body: { code: pin.value.join('') } })
    codes.value = res.recoveryCodes
    step.value = 'codes'
    setup.value = null
    await refresh()
    notify.success('Two-step sign-in is on')
  } catch (err) {
    notify.error(err)
    pin.value = []
  } finally { busy.value = false }
}

// Turning off and new recovery codes both need the password
const offOpen = ref(false)
const off = reactive({ password: '', code: '' })
async function disable() {
  busy.value = true
  try {
    await $fetch('/api/account/2fa/disable', { method: 'POST', body: off })
    off.password = ''
    off.code = ''
    offOpen.value = false
    await refresh()
    notify.success('Two-step sign-in is off')
  } catch (err) { notify.error(err) } finally { busy.value = false }
}

const regenOpen = ref(false)
const regenPassword = ref('')
async function regenerate() {
  busy.value = true
  try {
    const res = await $fetch<{ recoveryCodes: string[] }>('/api/account/2fa/recovery-codes', { method: 'POST', body: { password: regenPassword.value } })
    codes.value = res.recoveryCodes
    regenPassword.value = ''
    regenOpen.value = false
    step.value = 'codes'
    await refresh()
  } catch (err) { notify.error(err) } finally { busy.value = false }
}

async function copyCodes() {
  await navigator.clipboard.writeText(codes.value.join('\n'))
  notify.success('Recovery codes copied')
}
function downloadCodes() {
  const blob = new Blob([`LogsTrace recovery codes\nEach code works once.\n\n${codes.value.join('\n')}\n`], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'logstrace-recovery-codes.txt'
  a.click()
  URL.revokeObjectURL(url)
}

// Turning alerts off needs the password, so a stolen session can't silence them
const alertsOffOpen = ref(false)
const alertsPassword = ref('')
async function saveAlerts(on: boolean) {
  busy.value = true
  try {
    await $fetch('/api/account/security', { method: 'PATCH', body: { loginAlerts: on, password: on ? undefined : alertsPassword.value } })
    alertsPassword.value = ''
    alertsOffOpen.value = false
    await refresh()
  } catch (err) { notify.error(err) } finally { busy.value = false }
}
function toggleAlerts(on: boolean) {
  if (on) saveAlerts(true)
  else alertsOffOpen.value = true
}
</script>

<template>
  <div class="flex max-w-xl flex-col gap-6">
    <!-- Two-step sign-in -->
    <div class="rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="flex items-center gap-2 font-medium">
            <UIcon name="i-lucide-smartphone" class="size-4 text-muted" />
            Authenticator app
            <UBadge v-if="data?.totpEnabledAt" color="success" variant="subtle" size="sm">
              On
            </UBadge>
            <UBadge v-else color="neutral" variant="subtle" size="sm">
              Off
            </UBadge>
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ data?.totpEnabledAt
              ? `Signing in needs a code from your app. ${data.recoveryCodesLeft} recovery ${data.recoveryCodesLeft === 1 ? 'code' : 'codes'} left.`
              : 'Ask for a code from an app like Google Authenticator, 1Password or Authy after your password.' }}
          </p>
        </div>
        <template v-if="step === 'idle'">
          <UButton v-if="!data?.totpEnabledAt" size="sm" @click="step = 'password'">
            Turn on
          </UButton>
          <div v-else class="flex gap-2">
            <UButton size="sm" color="neutral" variant="outline" @click="regenOpen = !regenOpen; offOpen = false">
              New recovery codes
            </UButton>
            <UButton size="sm" color="error" variant="ghost" @click="offOpen = !offOpen; regenOpen = false">
              Turn off
            </UButton>
          </div>
        </template>
      </div>

      <form v-if="step === 'password'" class="mt-5 flex flex-wrap items-end gap-3 border-t border-default pt-5" @submit.prevent="startSetup">
        <UFormField label="Confirm your password" class="min-w-56 flex-1">
          <UInput v-model="password" type="password" autocomplete="current-password" class="w-full" autofocus />
        </UFormField>
        <UButton type="submit" :loading="busy" :disabled="!password">
          Continue
        </UButton>
        <UButton color="neutral" variant="ghost" @click="step = 'idle'; password = ''">
          Cancel
        </UButton>
      </form>

      <div v-if="step === 'scan' && setup" class="mt-5 grid gap-5 border-t border-default pt-5 sm:grid-cols-[auto_1fr]">
        <QrCode :value="setup.uri" :size="168" label="QR code for your authenticator app" />
        <div class="flex flex-col gap-3 text-sm">
          <p>
            <span class="font-medium">1.</span> Scan this code with your authenticator app.
          </p>
          <p class="text-muted">
            Can't scan it?
            <UButton variant="link" size="sm" class="px-0" @click="showSecret = !showSecret">
              {{ showSecret ? 'Hide the key' : 'Enter a key instead' }}
            </UButton>
          </p>
          <code v-if="showSecret" class="log-line break-all rounded-md bg-[var(--ui-bg-muted)] px-3 py-2 text-[0.8rem]">{{ setup.secret.match(/.{1,4}/g)?.join(' ') }}</code>
          <p>
            <span class="font-medium">2.</span> Enter the 6-digit code it shows.
          </p>
          <form class="flex flex-wrap items-center gap-3" @submit.prevent="confirmSetup">
            <UPinInput v-model="pin" :length="6" otp aria-label="Code from the app" @complete="confirmSetup" />
            <UButton type="submit" :loading="busy">
              Turn on
            </UButton>
          </form>
          <UButton variant="link" color="neutral" size="sm" class="self-start px-0" @click="step = 'idle'; setup = null; pin = []">
            Cancel
          </UButton>
        </div>
      </div>

      <div v-if="step === 'codes'" class="mt-5 border-t border-default pt-5">
        <p class="font-medium">
          Save your recovery codes
        </p>
        <p class="mt-1 text-sm text-muted">
          If you lose your phone, each code lets you sign in once. They won't be shown again.
        </p>
        <ul class="log-line mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-[var(--ui-bg-muted)] p-4 text-[0.85rem]">
          <li v-for="c in codes" :key="c">
            {{ c }}
          </li>
        </ul>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-copy" @click="copyCodes">
            Copy
          </UButton>
          <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-download" @click="downloadCodes">
            Download
          </UButton>
          <UButton size="sm" @click="step = 'idle'; codes = []">
            I saved them
          </UButton>
        </div>
      </div>

      <form v-if="offOpen" class="mt-5 grid gap-3 border-t border-default pt-5 sm:grid-cols-2" @submit.prevent="disable">
        <UFormField label="Password">
          <UInput v-model="off.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UFormField label="Code from the app or a recovery code">
          <UInput v-model="off.code" autocomplete="one-time-code" class="w-full" />
        </UFormField>
        <div class="flex gap-2 sm:col-span-2">
          <UButton type="submit" color="error" :loading="busy" :disabled="!off.password || off.code.length < 6">
            Turn off two-step sign-in
          </UButton>
          <UButton color="neutral" variant="ghost" @click="offOpen = false">
            Cancel
          </UButton>
        </div>
      </form>

      <form v-if="regenOpen" class="mt-5 flex flex-wrap items-end gap-3 border-t border-default pt-5" @submit.prevent="regenerate">
        <UFormField label="Confirm your password" help="Your current recovery codes will stop working." class="min-w-56 flex-1">
          <UInput v-model="regenPassword" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="busy" :disabled="!regenPassword">
          Create new codes
        </UButton>
      </form>
    </div>

    <!-- Sign-in alerts -->
    <div class="flex items-start justify-between gap-4 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-5">
      <div>
        <p class="flex items-center gap-2 font-medium">
          <UIcon name="i-lucide-mail-warning" class="size-4 text-muted" />
          Email me about new sign-ins
        </p>
        <p class="mt-1 text-sm text-muted">
          When your account signs in from a browser or device it hasn't used before. Password and two-step changes are always emailed.
        </p>
      </div>
      <USwitch :model-value="(data?.loginAlerts ?? true) && !alertsOffOpen" aria-label="Email me about new sign-ins" @update:model-value="toggleAlerts" />
    </div>
    <form v-if="alertsOffOpen" class="-mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-default bg-[var(--ui-bg-elevated)] p-5" @submit.prevent="saveAlerts(false)">
      <UFormField label="Confirm your password to turn alerts off" class="min-w-56 flex-1">
        <UInput v-model="alertsPassword" type="password" autocomplete="current-password" class="w-full" autofocus />
      </UFormField>
      <UButton type="submit" color="neutral" :loading="busy" :disabled="!alertsPassword">
        Turn off
      </UButton>
      <UButton color="neutral" variant="ghost" @click="alertsOffOpen = false; alertsPassword = ''">
        Keep them on
      </UButton>
    </form>
  </div>
</template>
