<script setup lang="ts">
defineProps<{ messages: TicketThreadMessage[], viewer: 'user' | 'staff' }>()

const when = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <ol class="flex flex-col gap-4">
    <li v-for="m in messages" :key="m.id">
      <p v-if="m.author === 'system'" class="flex items-center gap-2 text-xs text-muted">
        <UIcon :name="m.internal ? 'i-lucide-eye-off' : 'i-lucide-history'" class="size-3.5" />
        {{ m.body }} · {{ when(m.createdAt) }}
      </p>
      <article
        v-else
        class="rounded-lg border p-4"
        :class="m.internal
          ? 'border-dashed border-warning/60 bg-warning/5'
          : m.author === 'staff' ? 'border-primary/40 bg-primary/5' : 'border-default bg-[var(--ui-bg-elevated)]'"
      >
        <header class="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <UAvatar :alt="m.authorName ?? '?'" size="2xs" />
          <span class="font-medium">{{ m.authorName ?? 'Deleted user' }}</span>
          <UBadge v-if="m.author === 'staff'" size="sm" variant="subtle">
            {{ viewer === 'user' ? 'LogsTrace support' : 'Staff' }}
          </UBadge>
          <UBadge v-if="m.internal" size="sm" color="warning" variant="subtle">
            Internal note
          </UBadge>
          <span class="text-muted">{{ when(m.createdAt) }}</span>
          <UIcon v-if="m.via === 'email'" name="i-lucide-mail" class="size-3.5 text-muted" title="Sent by email" />
        </header>
        <!-- Plain text only: message bodies are user content -->
        <p class="whitespace-pre-wrap break-words text-sm leading-relaxed">{{ m.body }}</p>
      </article>
    </li>
  </ol>
</template>
