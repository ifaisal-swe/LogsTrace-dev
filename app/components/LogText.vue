<script setup lang="ts">
// A log message as readable text: each line gets its own writing direction and simple Markdown is styled.
// `pattern` is the message's table pattern; its fixed words decide the direction when known.
const props = defineProps<{ text: string, pattern?: string | null, inline?: boolean }>()

const base = computed(() => patternDirection(props.pattern))
const lines = computed(() => (props.inline ? [props.text.replace(/\s*\n\s*/g, ' · ')] : props.text.split('\n'))
  .map(line => ({ dir: base.value ?? textDirection(line) ?? 'auto', parts: parseInline(line) })))

const STYLE: Record<InlinePart['kind'], string> = {
  plain: '',
  bold: 'font-semibold',
  code: 'rounded-sm bg-[var(--ui-bg-accented)] px-1',
  hidden: 'rounded-sm bg-[var(--ui-bg-accented)] px-0.5 text-muted',
  underline: 'underline underline-offset-2'
}
</script>

<template>
  <span>
    <span v-for="(line, i) in lines" :key="i" :dir="line.dir" :class="inline ? '' : 'block'">
      <template v-if="line.parts.length">
        <!-- Marked-up values (names, ids) get their own direction so they don't reorder the sentence around them -->
        <span v-for="(p, j) in line.parts" :key="j" :class="STYLE[p.kind]" :dir="p.kind === 'plain' ? undefined : 'auto'">{{ p.text }}</span>
      </template>
      <template v-else>&nbsp;</template>
    </span>
  </span>
</template>
