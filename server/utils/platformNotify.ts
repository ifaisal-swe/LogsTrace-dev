// Operator feed: selected audit events of the whole platform posted to one Discord webhook
// (NUXT_PLATFORM_WEBHOOK_URL). Batched, rate-friendly, and never blocks or fails a request.

type Ctx = { userId?: string | null, orgId?: string | null, meta?: Record<string, unknown> }
type Item = { action: string, at: Date, ctx: Ctx }

const DEFAULT_EVENTS = [
  'auth.register', 'auth.email_verified',
  'org.created', 'org.deleted',
  'project.created', 'project.deleted',
  'invite.accepted', 'member.removed', 'member.left',
  'apikey.created', 'alert.created', 'logs.purged',
  'admin.user_updated',
  'ticket.created', 'ticket.replied', 'ticket.answered', 'ticket.status_changed'
]

const LABELS: Record<string, { title: string, color: number }> = {
  'auth.register': { title: 'New sign-up', color: 0x1e8b7e },
  'auth.email_verified': { title: 'Email verified', color: 0x3fa597 },
  'org.created': { title: 'New organization', color: 0x2a78d6 },
  'org.deleted': { title: 'Organization deleted', color: 0xe34948 },
  'project.created': { title: 'New project', color: 0x2a78d6 },
  'project.deleted': { title: 'Project deleted', color: 0xe34948 },
  'invite.accepted': { title: 'Invitation accepted', color: 0x1baf7a },
  'member.removed': { title: 'Member removed', color: 0xeda100 },
  'member.left': { title: 'Member left', color: 0xeda100 },
  'apikey.created': { title: 'API key created', color: 0x4a3aa7 },
  'alert.created': { title: 'Alert created', color: 0x4a3aa7 },
  'logs.purged': { title: 'Messages deleted', color: 0xe34948 },
  'admin.user_updated': { title: 'User changed by an admin', color: 0xeda100 },
  'ticket.created': { title: 'New support request', color: 0x2a78d6 },
  'ticket.replied': { title: 'Requester replied', color: 0x1e8b7e },
  'ticket.answered': { title: 'Support answered', color: 0x1baf7a },
  'ticket.note': { title: 'Internal note', color: 0x7a8783 },
  'ticket.status_changed': { title: 'Request status changed', color: 0xeda100 },
  'ticket.updated': { title: 'Request updated', color: 0x7a8783 }
}

const MAX_QUEUE = 200
const queue: Item[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let dropped = 0
let urlCheckedAt = 0

function settings() {
  const c = useRuntimeConfig()
  const events = String(c.platformWebhookEvents || '').split(',').map(s => s.trim()).filter(Boolean)
  return { url: String(c.platformWebhookUrl || ''), events: events.length ? events : DEFAULT_EVENTS, showEmails: !!c.platformWebhookShowEmails }
}

export function notifyPlatform(action: string, ctx: Ctx) {
  const s = settings()
  // "ticket.*" in NUXT_PLATFORM_WEBHOOK_EVENTS selects a whole group
  if (!s.url || !(s.events.includes(action) || s.events.includes(`${action.split('.')[0]}.*`))) return
  if (queue.length >= MAX_QUEUE) {
    dropped++
    return
  }
  queue.push({ action, at: new Date(), ctx })
  // Collect a few seconds of events into one message
  timer ??= setTimeout(() => { timer = null; flush().catch(err => console.error('[platform-webhook] failed', err)) }, 5000)
}

const maskEmail = (email: string) => email.replace(/^(.).*?(@.*)$/, '$1•••$2')
// Names come from users; keep Discord from turning them into mentions or links
const plain = (s: string) => s.replace(/[\\*_~|`[\]()<>@#]/g, m => `\\${m}`).slice(0, 120)

const plainBlock = (s: string) => {
  const cut = s.length > 400 ? `${s.slice(0, 400)}…` : s
  return cut.replace(/[\\*_~|`[\]()<>@#]/g, m => `\\${m}`)
}

async function describe(item: Item, showEmails: boolean) {
  const db = useDb()
  const { userId, orgId, meta = {} } = item.ctx
  const fields: { name: string, value: string, inline: boolean }[] = []
  if (userId) {
    const [u] = await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    if (u) fields.push({ name: 'User', value: plain(`${u.name} (${showEmails ? u.email : maskEmail(u.email)})`), inline: true })
  }
  if (orgId) {
    const [o] = await db.select({ name: schema.organizations.name, slug: schema.organizations.slug }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
    fields.push({ name: 'Organization', value: o ? plain(`${o.name} (${o.slug})`) : String(meta.slug ?? 'deleted'), inline: true })
  }
  const projectId = typeof meta.projectId === 'string' ? meta.projectId : null
  if (projectId) {
    const [p] = await db.select({ name: schema.projects.name, slug: schema.projects.slug }).from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)
    if (p) fields.push({ name: 'Project', value: plain(`${p.name} (${p.slug})`), inline: true })
  } else if (item.action.startsWith('project.') && typeof meta.slug === 'string') {
    fields.push({ name: 'Project', value: plain(meta.slug), inline: true })
  }
  if (typeof meta.removed === 'number') fields.push({ name: 'Removed', value: meta.removed.toLocaleString('en'), inline: true })
  if (typeof meta.name === 'string' && (item.action === 'apikey.created' || item.action === 'alert.created')) fields.push({ name: 'Name', value: plain(meta.name), inline: true })
  const ticketId = typeof meta.ticketId === 'string' ? meta.ticketId : null
  let url: string | undefined
  let description: string | undefined
  if (ticketId) {
    const [t] = await db.select({ number: schema.tickets.number, subject: schema.tickets.subject, status: schema.tickets.status, priority: schema.tickets.priority })
      .from(schema.tickets).where(eq(schema.tickets.id, ticketId)).limit(1)
    if (t) {
      fields.push({ name: 'Request', value: plain(`#${t.number} ${t.subject}`), inline: false })
      fields.push({ name: 'Status', value: TICKET_STAFF_STATUS_LABELS[t.status], inline: true }, { name: 'Priority', value: TICKET_PRIORITY_LABELS[t.priority], inline: true })
    }
    if (meta.via === 'email') fields.push({ name: 'Via', value: 'Email', inline: true })
    url = appLink(`/app/admin/tickets/${ticketId}`)
    const messageId = typeof meta.messageId === 'string' ? meta.messageId : null
    const [m] = await db.select({ body: schema.ticketMessages.body, internal: schema.ticketMessages.internal }).from(schema.ticketMessages)
      .where(messageId ? eq(schema.ticketMessages.id, messageId) : eq(schema.ticketMessages.ticketId, ticketId))
      .orderBy(asc(schema.ticketMessages.createdAt)).limit(1)
    // Message text is user content: escaped and cut short
    if (m && !m.internal) description = plainBlock(m.body)
  }
  const label = LABELS[item.action] ?? { title: item.action, color: 0x7a8783 }
  return { title: label.title, color: label.color, url, description, fields, timestamp: item.at.toISOString(), footer: { text: item.action } }
}

async function flush() {
  const { url, showEmails } = settings()
  if (!url || !queue.length) return
  if (Date.now() - urlCheckedAt > 10 * 60_000) {
    await checkWebhookUrl('discord', url)
    urlCheckedAt = Date.now()
  }
  while (queue.length) {
    // Discord allows 10 embeds per message
    const batch = queue.splice(0, 10)
    const embeds = await Promise.all(batch.map(i => describe(i, showEmails)))
    const content = dropped ? `${dropped} older events were skipped because too many arrived at once.` : undefined
    dropped = 0
    const send = () => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'LogsTrace-Platform' },
      body: JSON.stringify({ username: 'LogsTrace', content, embeds, allowed_mentions: { parse: [] } }),
      redirect: 'manual',
      signal: AbortSignal.timeout(5000)
    })
    let res = await send()
    if (res.status === 429) {
      const wait = Math.min(10, Number((await res.json().catch(() => ({})) as { retry_after?: number }).retry_after ?? 2))
      await new Promise(r => setTimeout(r, wait * 1000))
      res = await send()
    }
    if (!res.ok) console.error('[platform-webhook] Discord answered', res.status)
  }
}
