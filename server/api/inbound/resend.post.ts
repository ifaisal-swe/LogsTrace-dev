// Resend "email.received" webhook: replies to ticket emails and new requests sent to the support address.
// Authenticated by the Svix signature, not cookies (see 02.csrf.ts).
type ReceivedEvent = {
  type: string
  data?: { email_id?: string, from?: string, to?: string[], cc?: string[], received_for?: string[], message_id?: string, subject?: string }
}

const ignored = (reason: string) => {
  console.info('[inbound] ignored:', reason)
  return { ok: true, ignored: reason }
}

export default defineEventHandler(async (event) => {
  if (!inboundEnabled()) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const raw = await readRawBody(event, 'utf8') ?? ''
  if (!verifySvix(event, raw)) throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })

  let payload: ReceivedEvent
  try {
    payload = JSON.parse(raw)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }
  const d = payload.data
  if (payload.type !== 'email.received' || !d?.email_id || !d.from) return ignored('not a received email')

  const target = matchRecipient([...(d.to ?? []), ...(d.cc ?? []), ...(d.received_for ?? [])])
  if (!target) return ignored('not addressed to support')
  const messageId = d.message_id ? String(d.message_id).slice(0, 300) : `resend:${d.email_id}`
  // Resend retries deliveries; the same email must not post twice
  const [dup] = await useDb().select({ id: schema.ticketMessages.id }).from(schema.ticketMessages)
    .where(eq(schema.ticketMessages.emailMessageId, messageId)).limit(1)
  if (dup) return ignored('duplicate')

  const from = senderAddress(d.from)

  // Throwing here makes Resend retry later
  const mail = await fetchReceivedEmail(d.email_id).catch((err) => {
    console.error('[inbound] could not fetch email', err?.message)
    throw createError({ statusCode: 502, statusMessage: 'Could not fetch email' })
  })
  if (isAutoReply(mail.headers)) return ignored('auto reply')
  const trust = senderTrust(mail)
  if (trust === 'none') return ignored('sender failed SPF/DKIM/DMARC')

  const [sender] = await useDb().select({
    id: schema.users.id, name: schema.users.name, email: schema.users.email,
    platformRole: schema.users.platformRole, emailVerifiedAt: schema.users.emailVerifiedAt
  }).from(schema.users).where(and(sql`lower(${schema.users.email}) = ${from}`, isNull(schema.users.disabledAt))).limit(1)
  if (!sender) return ignored('unknown sender')
  // Counted per account after authentication, so forged mail can't use up someone's quota
  const limit = await hitRateLimit(`inbound:${sender.id}`, 30, 3600)
  if (!limit.allowed) return ignored('rate limited')
  const staff = isSupportStaff(sender.platformRole)
  const canOpen = async () => {
    if (useRuntimeConfig().requireEmailVerification && !sender.emailVerifiedAt) return 'unverified account'
    const opened = await hitRateLimit(`ticket-create:${sender.id}`, 5, 3600)
    return opened.allowed ? null : 'too many new requests'
  }

  const text = replyText(mail)
  const parsed = ticketBodySchema.safeParse(text)
  if (!parsed.success) return ignored('empty message')
  const body = parsed.data

  try {
    if (target.replyKey) {
      const ticket = await findTicketByReplyKey(target.replyKey)
      if (!ticket) return ignored('unknown ticket')
      // Staff writing a command on their own ticket act as staff
      const asStaff = staff && (sender.id !== ticket.userId || body.startsWith('/'))
      if (sender.id === ticket.userId && !asStaff) {
        if (ticket.status === 'closed') {
          if (trust !== 'strong') return ignored('follow-up needs DMARC pass')
          const blocked = await canOpen()
          if (blocked) return ignored(blocked)
          // A reply to a closed request starts a follow-up instead of being lost
          const subject = `Follow-up to #${ticket.number}: ${ticket.subject}`.slice(0, 150)
          await createTicket(null, { user: sender, subject, category: ticket.category, priority: 'normal', body, via: 'email', emailMessageId: messageId })
          return { ok: true }
        }
        await addUserReply(null, ticket, sender, body, 'email', messageId)
        return { ok: true }
      }
      if (asStaff) {
        // Staff actions by email need the From domain proven, not just any SPF/DKIM pass
        if (trust !== 'strong') return ignored('staff email needs DMARC pass')
        const cmd = staffCommands(body)
        if ('error' in cmd) return ignored(cmd.error)
        if (!cmd.body) return ignored('empty message')
        await addStaffReply(null, ticket, sender, { body: cmd.body, internal: cmd.internal, status: cmd.status }, 'email', messageId)
        return { ok: true }
      }
      return ignored('sender is not part of this ticket')
    }

    // Without a reply key nothing secret backs the From address
    if (trust !== 'strong') return ignored('new ticket needs DMARC pass')
    const blocked = await canOpen()
    if (blocked) return ignored(blocked)
    const subj = ticketSubjectSchema.safeParse((mail.subject ?? d.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 150))
    await createTicket(null, { user: sender, subject: subj.success ? subj.data : 'Request by email', category: 'other', priority: 'normal', body, via: 'email', emailMessageId: messageId })
    return { ok: true }
  } catch (err) {
    // Unique index on email_message_id: a parallel retry already stored it
    if ((err as { code?: string }).code === '23505') return ignored('duplicate')
    throw err
  }
})
