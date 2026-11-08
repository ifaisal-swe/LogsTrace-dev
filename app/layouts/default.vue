<script setup lang="ts">
const { user, loaded, refresh } = useAuth()
if (!loaded.value) await refresh()

const DOCS = 'https://docs.logstrace.dev'
const links = [
  { label: 'Use cases', to: '/#use-cases' },
  { label: 'Features', to: '/#features' },
  { label: 'Teams', to: '/#teams' }
]
</script>

<template>
  <div class="min-h-dvh">
    <header class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <AppLogo />
      <nav class="flex items-center gap-1 sm:gap-2" aria-label="Main">
        <UButton v-for="l in links" :key="l.to" :to="l.to" variant="ghost" color="neutral" class="hidden md:inline-flex">
          {{ l.label }}
        </UButton>
        <UButton :to="DOCS" target="_blank" variant="ghost" color="neutral">
          Docs
        </UButton>
        <UButton v-if="user" to="/app/continue">
          Open dashboard
        </UButton>
        <template v-else>
          <UButton to="/login" variant="ghost" color="neutral" class="hidden sm:inline-flex">
            Sign in
          </UButton>
          <UButton to="/register">
            Start for free
          </UButton>
        </template>
      </nav>
    </header>
    <main>
      <slot />
    </main>
    <footer class="mx-auto mt-24 max-w-6xl border-t border-default px-5 py-10 text-sm text-muted sm:px-8">
      <div class="flex flex-col gap-8 sm:flex-row sm:justify-between">
        <div class="max-w-xs">
          <AppLogo />
          <p class="mt-3">
            Logs from any system, sorted into tables you can search.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-x-12 gap-y-2 sm:grid-cols-3">
          <div class="flex flex-col gap-2">
            <p class="font-medium text-default">
              Product
            </p>
            <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="hover:text-default">
              {{ l.label }}
            </NuxtLink>
          </div>
          <div class="flex flex-col gap-2">
            <p class="font-medium text-default">
              Developers
            </p>
            <a :href="DOCS" target="_blank" class="hover:text-default">Documentation</a>
            <a :href="`${DOCS}/guides/getting-started/quickstart`" target="_blank" class="hover:text-default">Quickstart</a>
            <a :href="`${DOCS}/api-reference/overview/introduction`" target="_blank" class="hover:text-default">API reference</a>
          </div>
          <div class="flex flex-col gap-2">
            <p class="font-medium text-default">
              Account
            </p>
            <NuxtLink :to="user ? '/app/continue' : '/login'" class="hover:text-default">
              {{ user ? 'Open dashboard' : 'Sign in' }}
            </NuxtLink>
            <NuxtLink v-if="!user" to="/register" class="hover:text-default">
              Create an account
            </NuxtLink>
            <a href="/.well-known/security.txt" class="hover:text-default">Security</a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
