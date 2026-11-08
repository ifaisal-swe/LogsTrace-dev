<script setup lang="ts">
// Where "Sign in" and "Open dashboard" land: the last project's logs, the only project's logs, or the project list
definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const { data: projects } = await useMyProjects()
const last = useLastProject()
const list = projects.value ?? []
const remembered = list.find(p => `${p.orgSlug}/${p.projectSlug}` === last.value)
const target = remembered ?? (list.length === 1 ? list[0] : undefined)
await navigateTo(target ? `${projectPath(target)}/logs` : '/app', { replace: true })
</script>

<template>
  <div />
</template>
