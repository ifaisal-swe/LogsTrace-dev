import { z } from 'zod'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_EVENTS = 500

// Many loggers send null for empty embed parts; treat it like a missing field
const embedSchema = z.object({
  title: z.string().max(256).nullish(),
  description: z.string().max(4096).nullish(),
  fields: z.array(z.object({ name: z.string().max(256).nullish(), value: z.string().max(1024).nullish(), inline: z.boolean().nullish() })).max(25).nullish()
}).passthrough()

const idSchema = z.string().trim().min(1).max(128).regex(/^[\w.:-]+$/, 'Use letters, digits, - _ . or :')

const eventSchema = z.object({
  ts: z.union([z.string(), z.number()]).optional(),
  channel: z.string().trim().max(100).optional(),
  level: z.enum(LOG_LEVELS).optional(),
  text: z.string().max(16_000).optional(),
  embed: embedSchema.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  event: idSchema.max(100).optional(),
  // Top-level keys that aren't envelope fields (name, id, …)
  fields: z.record(z.string(), z.unknown()).default({}),
  traceId: idSchema.optional(),
  spanId: idSchema.optional()
}).refine(e => e.text || e.embed || e.event || Object.keys(e.fields).length || Object.keys(e.data ?? {}).length,
  'Each event needs fields (like { "event": "user.signup", "id": "42" }), text (or message), or an embed')

type RawEvent = Record<string, unknown>
const ENVELOPE = new Set(['ts', 'timestamp', 'time', '@timestamp', 'channel', 'resource', 'service', 'source', 'level', 'severity', 'severityText',
  'text', 'message', 'msg', 'body', 'embed', 'data', 'metadata', 'meta', 'attributes', 'event', 'traceId', 'trace_id', 'spanId', 'span_id', 'parentId', 'parent_id'])
const pick = (e: RawEvent, ...keys: string[]) => keys.map(k => e[k]).find(v => v !== undefined && v !== null)

// Accepts the common field names other log APIs and loggers use, so clients can switch without code changes
function normalize(raw: unknown, defaultChannel: string | undefined): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const e = raw as RawEvent
  const data = pick(e, 'data', 'metadata', 'meta', 'attributes') as Record<string, unknown> | undefined
  const fromData = (k: string[]) => (data && typeof data === 'object' ? k.map(x => data[x]).find(v => typeof v === 'string' && v) : undefined)
  const level = pick(e, 'level', 'severity', 'severityText')
  const normalizedLevel = level === undefined ? undefined : normalizeLevel(level)
  if (level !== undefined && !normalizedLevel) return { ...e, level: String(level) } // let zod name the bad value
  return {
    ts: pick(e, 'ts', 'timestamp', 'time', '@timestamp'),
    channel: pick(e, 'channel', 'resource', 'service', 'source') ?? defaultChannel,
    level: normalizedLevel ?? undefined,
    text: pick(e, 'text', 'message', 'msg', 'body'),
    embed: e.embed ?? undefined,
    data,
    event: e.event ?? undefined,
    fields: Object.fromEntries(Object.entries(e).filter(([k]) => !ENVELOPE.has(k))),
    traceId: pick(e, 'traceId', 'trace_id') ?? fromData(['traceId', 'trace_id']),
    spanId: pick(e, 'spanId', 'span_id', 'parentId', 'parent_id') ?? fromData(['spanId', 'span_id'])
  }
}

function parseTs(ts: string | number | undefined) {
  if (ts === undefined) return new Date()
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts)
  // Reject absurd clocks; fall back to receive time
  return Number.isNaN(d.getTime()) || Math.abs(d.getTime() - Date.now()) > 7 * 86400_000 ? new Date() : d
}

export default defineEventHandler(async (event) => {
  const length = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (length > MAX_BODY_BYTES) throw createError({ statusCode: 413, statusMessage: 'Body too large (max 2 MB). Send smaller batches.' })

  const { keyId, projectId } = await requireApiKey(event, 'ingest')
  await enforceRateLimit(event, `ingest:key:${keyId}`, 1200, 60)

  const body = await readBody(event).catch(() => null)
  const defaultChannel = getRequestHeader(event, 'x-logstrace-channel')?.trim().slice(0, 100) || undefined
  // Body may be one event, an array of events, or { events: [...] }
  const list: unknown[] = Array.isArray(body) ? body : body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events) ? (body as { events: unknown }).events as unknown[] : [body]
  if (!Array.isArray(list) || !list.length) throw createError({ statusCode: 400, statusMessage: 'Send at least one event.' })
  if (list.length > MAX_EVENTS) throw createError({ statusCode: 400, statusMessage: `Send at most ${MAX_EVENTS} events per request.` })

  const events: z.infer<typeof eventSchema>[] = []
  for (const [i, raw] of list.entries()) {
    const parsed = eventSchema.safeParse(normalize(raw, defaultChannel))
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = [list.length > 1 ? `events.${i}` : '', ...(issue?.path ?? [])].filter(x => x !== '').join('.')
      throw createError({ statusCode: 400, statusMessage: `Invalid event. ${where ? `${where}: ` : ''}${issue?.message ?? 'Check the request body.'}` })
    }
    events.push(parsed.data)
  }

  const rows: NewLogRow[] = []
  const newTemplates = new Set<string>()
  for (const e of events) {
    const data = { ...e.data, ...e.fields }
    if (JSON.stringify(data).length > 32_000) throw createError({ statusCode: 400, statusMessage: 'Event data is larger than 32 KB.' })
    // No text or embed: a structured event. Top-level keys are the columns; `data` only when there are none
    const columnSource = Object.keys(e.fields).length ? e.fields : e.data ?? {}
    const structured = e.text || e.embed ? null : structuredText(e.event, columnSource)
    const text = structured?.text ?? e.text ?? embedToText(e.embed)
    const channel = e.channel ?? ''
    const template = await matchTemplate(projectId, channel, text, structured?.columns)
    if (template?.created) newTemplates.add(template.id)
    rows.push({
      projectId,
      apiKeyId: keyId,
      templateId: template?.id ?? null,
      ts: parseTs(e.ts),
      channel,
      level: e.level ?? 'info',
      text,
      embed: e.embed ?? null,
      data,
      traceId: e.traceId ?? null,
      spanId: e.spanId ?? null
    })
  }

  let inserted: LogRow[]
  try {
    inserted = await insertLogs(rows)
  } catch (err) {
    console.error('[ingest] log store write failed', err)
    // Senders retry 5xx, so nothing is lost while ClickHouse is briefly unavailable
    throw createError({ statusCode: 503, statusMessage: 'Log storage is unavailable. Retry shortly.' })
  }
  await flushTemplates(projectId)
  await publishLive(projectId, inserted.map(r => r.id), [...newTemplates])
  // Alerts never slow down or fail ingest
  checkIngestAlerts(projectId, inserted, [...newTemplates]).catch(err => console.error('[alerts] ingest check failed', err))
  return { accepted: rows.length, status: 'ok' }
})
