<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
useSeoMeta({ title: () => (notFound.value ? 'Page not found' : 'Something went wrong') })
</script>

<template>
  <UApp>
    <div class="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <AppLogo />
      <p class="log-line mt-12 text-sm text-muted">
        HTTP {{ error.statusCode }}
      </p>
      <h1 class="mt-2 text-3xl font-semibold tracking-[-0.02em]">
        {{ notFound ? 'This page doesn\'t exist' : (error.statusMessage || 'Something went wrong') }}
      </h1>
      <p class="mt-3 text-muted">
        {{ notFound ? 'Check the address, or go back to your dashboard.' : 'Try again. If it keeps happening, check the server console.' }}
      </p>
      <div class="mt-8 flex gap-3">
        <UButton @click="clearError({ redirect: '/app' })">
          Open dashboard
        </UButton>
        <UButton color="neutral" variant="outline" @click="clearError({ redirect: '/' })">
          Home
        </UButton>
      </div>
    </div>
  </UApp>
</template>
