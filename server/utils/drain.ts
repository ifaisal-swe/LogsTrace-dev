import type { TemplateField } from '../db/schema'

// Drain-style template mining: messages with the same fixed words are grouped, and the positions
// that differ between them become variables (<*>). See He et al., "Drain: An Online Log Parsing
// Approach with Fixed Depth Tree" (ICWS 2017). This is the flat variant: group by channel + length.

export const WILDCARD = '<*>'
const SIMILARITY = 0.5
const MAX_TOKENS = 200

type Template = { id: string, tokens: string[], fields: TemplateField[], dirty: boolean, pendingCount: number }
type Group = Template[]

// projectId -> "channel|length" -> templates
const cache = new Map<string, Map<string, Group>>()
const loading = new Map<string, Promise<void>>()

export function normalizeText(text: string) {
  return text
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string) {
  return normalizeText(text).split(' ').filter(Boolean).slice(0, MAX_TOKENS)
}

const hasDigit = /\d/

function similarity(template: string[], tokens: string[]) {
  let same = 0
  for (let i = 0; i < tokens.length; i++) {
    if (template[i] === tokens[i]) same++
    // Tokens with digits are likely ids/amounts; don't let them alone split templates
    else if (template[i] === WILDCARD && hasDigit.test(tokens[i]!)) same += 0.5
  }
  return same / tokens.length
}

export function inferType(values: string[]): TemplateField['type'] {
  const sample = values.filter(Boolean).slice(0, 20)
  if (!sample.length) return 'text'
  // IPs look numeric but are identifiers
  if (sample.every(v => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(v))) return 'id'
  if (sample.every(v => /^[-+]?[$]?[\d,.]+[$%]?$/.test(v))) return 'number'
  // [12] / #12, UUIDs, long hex ids, and prefixed ids like usr_8f2k or order-10293
  if (sample.every(v => /^[#[]?\d+\]?$|^[0-9a-f]{8}-[0-9a-f-]{27}$|^[0-9a-f]{12,}$|^[a-z]+[_-][\w-]+$/i.test(v))) return 'id'
  return 'text'
}

// `names`: column names for new value positions (structured events); '' means pick field_N
function syncFields(t: Template, example: string[], names?: Map<number, string>) {
  const byPosition = new Map(t.fields.map(f => [f.position, f]))
  const wildcards = t.tokens.flatMap((tok, position) => (tok === WILDCARD ? [position] : []))
  // Names chosen by people (or later by AI) survive template changes; new columns get an unused field_N
  const used = new Set(wildcards.flatMap(p => byPosition.has(p) ? [byPosition.get(p)!.name] : []))
  let k = 1
  const nextName = () => {
    while (used.has(`field_${k}`)) k++
    used.add(`field_${k}`)
    return `field_${k}`
  }
  const newName = (position: number) => {
    const wanted = names?.get(position)
    if (!wanted || used.has(wanted)) return nextName()
    used.add(wanted)
    return wanted
  }
  const fields = wildcards.map(position =>
    byPosition.get(position) ?? { name: newName(position), type: inferType([example[position] ?? '']), position })

  // Auto names (field_N) follow reading order; custom names are left alone
  const auto = /^field_\d+$/
  const taken = new Set(fields.filter(f => !auto.test(f.name)).map(f => f.name))
  let n = 1
  for (const f of fields) {
    if (!auto.test(f.name)) continue
    while (taken.has(`field_${n}`)) n++
    f.name = `field_${n++}`
  }
  t.fields = fields
}

async function loadProject(projectId: string) {
  if (cache.has(projectId)) return
  if (!loading.has(projectId)) {
    loading.set(projectId, (async () => {
      const rows = await useDb().select().from(schema.logTemplates).where(eq(schema.logTemplates.projectId, projectId))
      const groups = new Map<string, Group>()
      for (const r of rows) {
        const key = `${r.channel}|${r.tokens.length}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push({ id: r.id, tokens: r.tokens, fields: r.fields, dirty: false, pendingCount: 0 })
      }
      cache.set(projectId, groups)
    })().finally(() => loading.delete(projectId)))
  }
  await loading.get(projectId)
}

// Returns the template for a message, creating or generalising templates as needed.
// `columns` (structured events): value position -> column name; the other words are keys and must match exactly.
export async function matchTemplate(projectId: string, channel: string, text: string, columns?: Map<number, string>): Promise<{ id: string, created: boolean } | null> {
  const tokens = tokenize(text)
  if (!tokens.length) return null
  await loadProject(projectId)
  const groups = cache.get(projectId)!
  const key = `${channel}|${tokens.length}`
  const group = groups.get(key) ?? []
  groups.set(key, group)

  let best: Template | undefined
  let bestScore = 0
  if (columns) {
    best = group.find(t => t.tokens.every((tok, i) => columns.has(i) || tok === tokens[i]))
    bestScore = best ? 1 : 0
  } else {
    for (const t of group) {
      const score = similarity(t.tokens, tokens)
      if (score > bestScore) { best = t; bestScore = score }
    }
  }

  if (best && bestScore >= SIMILARITY) {
    let changed = false
    best.tokens = best.tokens.map((tok, i) => {
      if (tok === WILDCARD || (tok === tokens[i] && !columns?.has(i))) return tok
      changed = true
      return WILDCARD
    })
    if (changed) { syncFields(best, tokens, columns); best.dirty = true }
    best.pendingCount++
    return { id: best.id, created: false }
  }

  // New template. Tokens with digits start as variables, so "[12] joined" and "[88] joined" match at once.
  // Structured events: every value is a column from the start, keys stay fixed.
  const initial = tokens.map((tok, i) => ((columns ? columns.has(i) : hasDigit.test(tok)) ? WILDCARD : tok))
  const t: Template = { id: crypto.randomUUID(), tokens: initial, fields: [], dirty: false, pendingCount: 1 }
  syncFields(t, tokens, columns)
  await useDb().insert(schema.logTemplates).values({
    id: t.id, projectId, channel, tokens: t.tokens, pattern: t.tokens.join(' '), fields: t.fields, count: 0
  })
  group.push(t)
  return { id: t.id, created: true }
}

// Writes counts and changed patterns accumulated since the last flush
export async function flushTemplates(projectId: string) {
  const groups = cache.get(projectId)
  if (!groups) return
  const db = useDb()
  const gone: string[] = []
  for (const group of groups.values()) {
    for (const t of group) {
      if (!t.dirty && !t.pendingCount) continue
      const add = t.pendingCount
      t.pendingCount = 0
      const set: Record<string, unknown> = {
        count: sql`${schema.logTemplates.count} + ${add}`,
        lastSeenAt: new Date()
      }
      if (t.dirty) {
        set.tokens = t.tokens
        set.pattern = t.tokens.join(' ')
        set.fields = t.fields
        t.dirty = false
      }
      const [row] = await db.update(schema.logTemplates).set(set).where(eq(schema.logTemplates.id, t.id)).returning({ id: schema.logTemplates.id })
      // Deleted meanwhile (possibly by another app instance): stop matching new messages to it
      if (!row) gone.push(t.id)
    }
  }
  for (const id of gone) forgetTemplate(projectId, id)
}

// Drops a deleted template from the in-memory copy so new messages build a fresh one
export function forgetTemplate(projectId: string, templateId: string) {
  for (const group of cache.get(projectId)?.values() ?? []) {
    const i = group.findIndex(x => x.id === templateId)
    if (i >= 0) group.splice(i, 1)
  }
}

// Applies a renamed template/field from the UI to the in-memory copy
export function updateCachedFields(projectId: string, templateId: string, fields: TemplateField[]) {
  for (const group of cache.get(projectId)?.values() ?? []) {
    const t = group.find(x => x.id === templateId)
    if (t) t.fields = fields
  }
}

export function extractValues(templateTokens: string[], text: string) {
  const tokens = tokenize(text)
  const values: Record<number, string> = {}
  templateTokens.forEach((tok, i) => { if (tok === WILDCARD) values[i] = tokens[i] ?? '' })
  return values
}

export function embedToText(embed: unknown) {
  if (!embed || typeof embed !== 'object') return ''
  const e = embed as { title?: unknown, description?: unknown, fields?: { name?: unknown, value?: unknown }[] }
  const parts: string[] = []
  if (typeof e.title === 'string') parts.push(e.title)
  if (typeof e.description === 'string') parts.push(e.description)
  if (Array.isArray(e.fields)) {
    for (const f of e.fields.slice(0, 25)) parts.push(`${String(f?.name ?? '')}: ${String(f?.value ?? '')}`)
  }
  return parts.join('\n')
}
