import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { SQL } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import type { Email, StaffTicketEvent } from './emailTemplates'

type Ticket = typeof schema.tickets.$inferSelect
type Person = { id: string, name: string, email: string }
type Via = 'web' | 'email'

// Reply-by-email needs both an inbound address and the webhook secret that proves Resend sent the email
export function inboundEnabled() {
  const c = useRuntimeConfig()
  return !!c.supportInboundAddress && !!c.resendWebhookSecret
}

// support@in.example.com + key -> support+key@in.example.com
export function replyAddress(replyKey: string) {
  const [local, domain] = String(useRuntimeConfig().supportInboundAddress).split('@')
  return `${local}+${replyKey}@${domain}`
}

// Shared References header makes mail clients thread every email of one ticket
function threadHeaders(ticketId: string) {
  const ref = `<ticket-${ticketId}@${new URL(useRuntimeConfig().appUrl).hostname}>`
  return { 'In-Reply-To': ref, 'References': ref }
}

// Database clock for every ticket timestamp, so read markers compare against message times consistently
const dbNow = () => sql`now()`

const userLink = (t: Ticket) => appLink(`/app/support/${t.id}`)
const staffLink = (t: Ticket) => appLink(`/app/admin/tickets/${t.id}`)
const label = (t: Ticket) => ({
  number: t.number,
  subject: t.subject,
  priority: TICKET_PRIORITY_LABELS[t.priority],
  category: TICKET_CATEGORY_LABELS[t.category]
})

// Mail failures are logged, never surfaced: the ticket change already happened
function deliver(to: string, email: Email, t: Ticket) {
  const opts = { headers: threadHeaders(t.id), ...(inboundEnabled() ? { replyTo: replyAddress(t.replyKey) } : {}) }
  sendMail(to, email, opts).catch(err => console.error('[tickets] email failed', (err as { statusMessage?: string }).statusMessage ?? err))
}

async function getPerson(id: string | null): Promise<Person | null> {
  if (!id) return null
  const [u] = await useDb().select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users).where(and(eq(schema.users.id, id), isNull(schema.users.disabledAt))).limit(1)
  return u ?? null
}

// Assignee if there is one, otherwise the whole support team; never the person who acted
async function staffRecipients(t: Ticket, exceptId?: string) {
  const assignee = await getPerson(t.assigneeId)
  const people = assignee
    ? [assignee]
    : await useDb().select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users)
        .where(and(inArray(schema.users.platformRole, ['admin', 'moderator']), isNull(schema.users.disabledAt))).limit(50)
  return people.filter(p => p.id !== exceptId)
}

async function notifyStaff(kind: StaffTicketEvent, t: Ticket, requester: Person, body: string | null, exceptId?: string) {
  const byEmail = inboundEnabled()
  for (const s of await staffRecipients(t, exceptId)) {
    deliver(s.email, ticketStaffEmail(kind, label(t), `${requester.name} <${requester.email}>`, body, staffLink(t), byEmail), t)
  }
}

export async function loadTicket(id: string) {
  const [t] = await useDb().select().from(schema.tickets).where(eq(schema.tickets.id, id)).limit(1)
  return t ?? null
}

export async function findTicketByReplyKey(replyKey: string) {
  const [t] = await useDb().select().from(schema.tickets).where(eq(schema.tickets.replyKey, replyKey)).limit(1)
  return t ?? null
}

// Requesters only see their own tickets; anything else is a 404 so ids don't leak
export async function requireOwnTicket(event: H3Event) {
  const user = requireVerifiedUser(event)
  const t = await loadTicket(getUuidParam(event, 'id'))
  if (!t || t.userId !== user.id) throw createError({ statusCode: 404, statusMessage: 'Request not found' })
  return { user, ticket: t }
}

export async function requireStaffTicket(event: H3Event) {
  const user = requireSupportStaff(event)
  const t = await loadTicket(getUuidParam(event, 'id'))
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Ticket not found' })
  return { user, ticket: t }
}

type CreateInput = {
  user: Person
  subject: string
  category: TicketCategory
  priority: TicketPriority
  body: string
  projectId?: string | null
  via: Via
  emailMessageId?: string
}

export async function createTicket(event: H3Event | null, input: CreateInput) {
  const db = useDb()
  let orgId: string | null = null
  if (input.projectId) {
    // Only link projects the requester is a member of
    const [p] = await db.select({ orgId: schema.projects.orgId }).from(schema.projects)
      .innerJoin(schema.memberships, and(eq(schema.memberships.orgId, schema.projects.orgId), eq(schema.memberships.userId, input.user.id)))
      .where(eq(schema.projects.id, input.projectId)).limit(1)
    if (!p) throw createError({ statusCode: 400, statusMessage: 'Invalid input', data: { field: 'projectId', message: 'Choose one of your projects' } })
    orgId = p.orgId
  }
  const ticket = await db.transaction(async (tx) => {
    const [t] = await tx.insert(schema.tickets).values({
      userId: input.user.id,
      orgId,
      projectId: input.projectId ?? null,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      replyKey: randomBytes(10).toString('hex'),
      userReadAt: dbNow()
    }).returning()
    await tx.insert(schema.ticketMessages).values({
      ticketId: t!.id, authorId: input.user.id, author: 'user', body: input.body, via: input.via, emailMessageId: input.emailMessageId
    })
    return t!
  })
  await audit(event, 'ticket.created', { userId: input.user.id, orgId, meta: { ticketId: ticket.id, number: ticket.number, via: input.via } })
  deliver(input.user.email, ticketReceivedEmail(input.user.name, label(ticket), input.body, userLink(ticket), inboundEnabled()), ticket)
  await notifyStaff('new', ticket, input.user, input.body)
  return ticket
}

export async function addUserReply(event: H3Event | null, t: Ticket, user: Person, body: string, via: Via, emailMessageId?: string) {
  if (t.status === 'closed') throw createError({ statusCode: 409, statusMessage: 'This request is closed. Open a new one instead.' })
  const reopened = t.status === 'resolved'
  const now = dbNow()
  const [msg] = await useDb().transaction(async (tx) => {
    const rows = await tx.insert(schema.ticketMessages).values({ ticketId: t.id, authorId: user.id, author: 'user', body, via, emailMessageId }).returning({ id: schema.ticketMessages.id })
    await tx.update(schema.tickets).set({ status: 'open', resolvedAt: null, lastMessageAt: now, userReadAt: now, updatedAt: now }).where(eq(schema.tickets.id, t.id))
    return rows
  })
  const updated = { ...t, status: 'open' as const }
  await audit(event, 'ticket.replied', { userId: user.id, orgId: t.orgId, meta: { ticketId: t.id, number: t.number, messageId: msg!.id, via, reopened } })
  await notifyStaff(reopened ? 'reopened' : 'reply', updated, user, body)
}

export async function addStaffReply(event: H3Event | null, t: Ticket, staff: Person, input: { body: string, internal: boolean, status?: TicketStatus }, via: Via, emailMessageId?: string) {
  const now = dbNow()
  // A public answer hands the turn to the requester unless another status was chosen
  const status = input.status ?? (input.internal ? t.status : 'waiting')
  const [msg] = await useDb().transaction(async (tx) => {
    const rows = await tx.insert(schema.ticketMessages).values({
      ticketId: t.id, authorId: staff.id, author: 'staff', body: input.body, internal: input.internal, via, emailMessageId
    }).returning({ id: schema.ticketMessages.id })
    await tx.update(schema.tickets).set({
      status,
      // Whoever answers first takes the ticket
      assigneeId: t.assigneeId ?? (input.internal ? null : staff.id),
      staffReadAt: now,
      updatedAt: now,
      ...(input.internal ? {} : { lastMessageAt: now }),
      ...statusTimestamps(t.status, status, now)
    }).where(eq(schema.tickets.id, t.id))
    return rows
  })
  await audit(event, input.internal ? 'ticket.note' : 'ticket.answered', { userId: staff.id, orgId: t.orgId, meta: { ticketId: t.id, number: t.number, messageId: msg!.id, via, status } })
  if (input.internal) return
  const requester = await getPerson(t.userId)
  if (requester) deliver(requester.email, ticketReplyEmail(requester.name, label(t), `${staff.name} (LogsTrace support)`, input.body, userLink(t), inboundEnabled()), t)
}

function statusTimestamps(from: TicketStatus, to: TicketStatus, now: SQL) {
  if (from === to) return {}
  return {
    resolvedAt: to === 'resolved' ? now : to === 'closed' ? undefined : null,
    closedAt: to === 'closed' ? now : null
  }
}

// System lines record who changed what, so the thread reads as a history
async function systemNote(ticketId: string, actorId: string | null, body: string, internal: boolean) {
  await useDb().insert(schema.ticketMessages).values({ ticketId, authorId: actorId, author: 'system', body, internal })
}

export async function updateTicketAsStaff(event: H3Event | null, t: Ticket, staff: Person, changes: { status?: TicketStatus, priority?: TicketPriority, assigneeId?: string | null }) {
  const now = dbNow()
  const set: PgUpdateSetSource<typeof schema.tickets> = { updatedAt: now }
  const notes: { body: string, internal: boolean }[] = []
  let assignee: Person | null = null

  if (changes.assigneeId !== undefined && changes.assigneeId !== t.assigneeId) {
    if (changes.assigneeId) {
      const [a] = await useDb().select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.platformRole })
        .from(schema.users).where(and(eq(schema.users.id, changes.assigneeId), isNull(schema.users.disabledAt))).limit(1)
      if (!a || !isSupportStaff(a.role)) throw createError({ statusCode: 400, statusMessage: 'Invalid input', data: { field: 'assigneeId', message: 'Choose someone on the support team' } })
      assignee = a
    }
    set.assigneeId = changes.assigneeId
    notes.push({ body: assignee ? `${staff.name} assigned this to ${assignee.name}.` : `${staff.name} unassigned this ticket.`, internal: true })
  }
  if (changes.priority && changes.priority !== t.priority) {
    set.priority = changes.priority
    notes.push({ body: `${staff.name} set priority to ${TICKET_PRIORITY_LABELS[changes.priority]}.`, internal: true })
  }
  if (changes.status && changes.status !== t.status) {
    set.status = changes.status
    Object.assign(set, statusTimestamps(t.status, changes.status, now))
    notes.push({ body: `Status changed to ${TICKET_STATUS_LABELS[changes.status]}.`, internal: false })
  }
  if (!notes.length) return t

  const [updated] = await useDb().update(schema.tickets).set(set).where(eq(schema.tickets.id, t.id)).returning()
  for (const n of notes) await systemNote(t.id, staff.id, n.body, n.internal)
  await audit(event, changes.status && changes.status !== t.status ? 'ticket.status_changed' : 'ticket.updated', {
    userId: staff.id, orgId: t.orgId, meta: { ticketId: t.id, number: t.number, from: t.status, ...changes }
  })

  if (assignee && assignee.id !== staff.id) {
    const requester = await getPerson(t.userId)
    deliver(assignee.email, ticketStaffEmail('assigned', label(updated!), requester ? `${requester.name} <${requester.email}>` : 'Deleted user', null, staffLink(updated!), inboundEnabled()), updated!)
  }
  if (changes.status === 'resolved' || changes.status === 'closed') {
    const requester = await getPerson(t.userId)
    if (requester && changes.status !== t.status) deliver(requester.email, ticketStatusEmail(requester.name, label(updated!), changes.status, userLink(updated!), inboundEnabled()), updated!)
  }
  return updated!
}

// Requesters can mark their own request resolved, or reopen a resolved one
export async function setStatusAsUser(event: H3Event, t: Ticket, user: Person, status: 'resolved' | 'open') {
  if (t.status === 'closed') throw createError({ statusCode: 409, statusMessage: 'This request is closed. Open a new one instead.' })
  if (status === 'open' && t.status !== 'resolved') return t
  if (status === 'resolved' && t.status === 'resolved') return t
  const now = dbNow()
  const [updated] = await useDb().update(schema.tickets).set({ status, updatedAt: now, ...statusTimestamps(t.status, status, now) })
    .where(eq(schema.tickets.id, t.id)).returning()
  await systemNote(t.id, user.id, status === 'resolved' ? `${user.name} marked this as resolved.` : `${user.name} reopened this request.`, false)
  await audit(event, 'ticket.status_changed', { userId: user.id, orgId: t.orgId, meta: { ticketId: t.id, number: t.number, from: t.status, status, byRequester: true } })
  if (status === 'open') await notifyStaff('reopened', updated!, user, null)
  return updated!
}

// Resolved tickets close on their own after a quiet period
export async function closeStaleTickets() {
  const days = Number(useRuntimeConfig().supportAutoCloseDays) || 7
  const rows = await useDb().update(schema.tickets).set({ status: 'closed', closedAt: dbNow(), updatedAt: dbNow() })
    .where(and(eq(schema.tickets.status, 'resolved'), lt(schema.tickets.resolvedAt, sql`now() - make_interval(days => ${days})`)))
    .returning({ id: schema.tickets.id })
  for (const r of rows) await systemNote(r.id, null, `Closed automatically after ${days} days without new messages.`, false)
}

export async function ticketMessages(ticketId: string, includeInternal: boolean) {
  const m = schema.ticketMessages
  return useDb().select({
    id: m.id, author: m.author, body: m.body, internal: m.internal, via: m.via, createdAt: m.createdAt,
    authorName: schema.users.name
  }).from(m).leftJoin(schema.users, eq(schema.users.id, m.authorId))
    .where(includeInternal ? eq(m.ticketId, ticketId) : and(eq(m.ticketId, ticketId), eq(m.internal, false)))
    .orderBy(asc(m.createdAt))
}
