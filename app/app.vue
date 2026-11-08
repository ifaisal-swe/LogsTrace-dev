<template>
  <UApp :toaster="{ position: 'bottom-right' }">
    <NuxtLoadingIndicator color="var(--color-tide-600)" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
