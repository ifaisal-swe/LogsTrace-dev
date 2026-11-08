const MAX_FIELDS = 50
const MAX_DEPTH = 3
const MAX_VALUE = 512
const MAX_TEXT = 16_000

// Nested objects become dotted keys so every value gets its own column
function flatten(obj: Record<string, unknown>, prefix: string, depth: number, out: [string, unknown][]) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < MAX_DEPTH - 1) flatten(v as Record<string, unknown>, key, depth + 1, out)
    else out.push([key, v])
  }
  return out
}

// Each value must stay exactly one word after tokenize(), or columns shift. Loop because stripping
// markdown can create new `__` / `**` runs.
function oneWord(value: string) {
  let s = value
  for (let prev = ''; prev !== s;) {
    prev = s
    s = s.replace(/\*\*|__|`/g, '').replace(/\s+/g, '_')
  }
  return s || '-'
}

function cell(v: unknown) {
  if (v === null || v === undefined || v === '') return '-'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return oneWord(s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s)
}

// Same rules as renaming a column in the UI; anything else falls back to field_N
function columnName(key: string) {
  const name = key.replace(/[^\p{L}\p{N}_ -]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return name && isSafeDisplayText(name) ? name : undefined
}

// `{ event, ...fields }` -> text like `user.signup name: Sara plan: pro` + column name per value position
export function structuredText(eventName: string | undefined, fields: Record<string, unknown>) {
  // Sorted: many languages (Lua, Go maps, PHP arrays after edits) don't keep key order, and order decides the table
  const pairs = flatten(fields, '', 0, []).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (pairs.length > MAX_FIELDS) throw createError({ statusCode: 400, statusMessage: `Invalid event. Send at most ${MAX_FIELDS} fields per event (nested keys count).` })
  const words: string[] = eventName ? [oneWord(eventName)] : []
  const columns = new Map<number, string>()
  for (const [key, value] of pairs) {
    words.push(`${oneWord(key)}:`)
    const name = columnName(key)
    columns.set(words.length, name ?? '')
    words.push(cell(value))
  }
  const text = words.join(' ')
  if (text.length > MAX_TEXT) throw createError({ statusCode: 400, statusMessage: 'Invalid event. Fields are longer than 16 KB as text.' })
  return { text, columns }
}
