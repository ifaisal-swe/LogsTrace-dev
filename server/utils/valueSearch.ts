import type { z } from 'zod'

const bareValue = (v: string) => v.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase()

// Finds every message where a whole word equals the value (an id, name, order number...) across all tables
export async function searchValue(projectId: string, sensitive: boolean,
  q: z.infer<typeof rangeSchema> & { value: string, template?: string, limit: number }) {
  const { rows, counts } = await findValue(projectId, sensitive, q)

  const ids = [...new Set(counts.flatMap(c => c.templateId ? [c.templateId] : []))]
  const templates = ids.length
    ? await useDb().select({ id: schema.logTemplates.id, name: schema.logTemplates.name, channel: schema.logTemplates.channel, pattern: schema.logTemplates.pattern, tokens: schema.logTemplates.tokens, fields: schema.logTemplates.fields })
      .from(schema.logTemplates).where(and(eq(schema.logTemplates.projectId, projectId), inArray(schema.logTemplates.id, ids)))
    : []
  const byId = new Map(templates.map(t => [t.id, t]))
  const needle = bareValue(q.value)

  // Which named columns held the value, e.g. "seller" vs "buyer"
  const matchedFields = (templateId: string | null, tk: string[]) => {
    const t = templateId ? byId.get(templateId) : undefined
    if (!t) return []
    return t.fields.filter(f => bareValue(tk[f.position] ?? '') === needle).map(f => f.name)
  }

  return {
    value: q.value,
    masked: !sensitive,
    capped: counts.reduce((s, c) => s + c.n, 0) >= VALUE_COUNT_WINDOW,
    tables: counts.map((c) => {
      const t = c.templateId ? byId.get(c.templateId) : undefined
      return { templateId: c.templateId, name: t?.name ?? null, channel: t?.channel ?? '', pattern: t?.pattern ?? '', count: c.n, last: c.last }
    }),
    rows: rows.map(r => ({
      id: r.id,
      ts: r.ts,
      channel: r.channel,
      level: r.level,
      templateId: r.templateId,
      text: r.tk.join(' '),
      matched: matchedFields(r.templateId, r.tk),
      fields: (r.templateId ? byId.get(r.templateId)?.fields ?? [] : []).map(f => ({ name: f.name, type: f.type, value: r.tk[f.position] ?? '' }))
    }))
  }
}
