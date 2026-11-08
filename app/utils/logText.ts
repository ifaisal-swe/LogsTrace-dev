const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/g
const LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g

// Writing direction of a sample by which script has more letters; undefined when it has no letters
export function textDirection(sample: string): 'ltr' | 'rtl' | undefined {
  const rtl = sample.match(RTL)?.length ?? 0
  const ltr = sample.match(LTR)?.length ?? 0
  if (!rtl && !ltr) return undefined
  return rtl > ltr ? 'rtl' : 'ltr'
}

// A table's fixed words are the sentence the sender wrote; names and other values must not flip it
export const patternDirection = (pattern: string | null | undefined) => (pattern ? textDirection(pattern.replaceAll('<*>', ' ')) : undefined)

export type InlinePart = { text: string, kind: 'plain' | 'bold' | 'code' | 'hidden' | 'underline' }

// The Markdown many loggers send (Discord style): **bold**, `code`, ||hidden||, __underline__. Rendered as text, never HTML.
const MARKUP = /\*\*(.+?)\*\*|`([^`]+)`|\|\|(.+?)\|\||__(.+?)__/g

export function parseInline(line: string): InlinePart[] {
  const parts: InlinePart[] = []
  let last = 0
  for (const m of line.matchAll(MARKUP)) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index), kind: 'plain' })
    if (m[1] !== undefined) parts.push({ text: m[1], kind: 'bold' })
    else if (m[2] !== undefined) parts.push({ text: m[2], kind: 'code' })
    else if (m[3] !== undefined) parts.push({ text: m[3], kind: 'hidden' })
    else parts.push({ text: m[4]!, kind: 'underline' })
    last = m.index + m[0].length
  }
  if (last < line.length) parts.push({ text: line.slice(last), kind: 'plain' })
  return parts
}
