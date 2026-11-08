import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

// Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body", key = base64 part of whsec_…
export function verifySvix(event: H3Event, rawBody: string) {
  const secret = String(useRuntimeConfig().resendWebhookSecret || '')
  const id = getRequestHeader(event, 'svix-id')
  const ts = getRequestHeader(event, 'svix-timestamp')
  const sigs = getRequestHeader(event, 'svix-signature')
  if (!secret || !id || !ts || !sigs) return false
  // Old timestamps are replays
  if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest()
  return sigs.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

type Received = {
  from: string
  subject: string | null
  text: string | null
  html: string | null
  headers: Record<string, string> | null
  authentication?: { spf?: string, dkim?: string, dmarc?: string }
}

export async function fetchReceivedEmail(emailId: string) {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${useRuntimeConfig().resendApiKey}` },
    signal: AbortSignal.timeout(10_000)
  })
  if (!res.ok) throw new Error(`Resend answered ${res.status}`)
  return await res.json() as Received
}

// Fails closed. 'strong' = DMARC pass (From domain aligned); 'weak' = SPF or DKIM pass for some domain,
// enough only together with a ticket's secret reply key from the requester
export function senderTrust(mail: Received): 'strong' | 'weak' | 'none' {
  const a = mail.authentication
  if (!a || a.dmarc === 'fail') return 'none'
  if (a.dmarc === 'pass') return 'strong'
  return a.dkim === 'pass' || a.spf === 'pass' ? 'weak' : 'none'
}

// Out-of-office and bounce messages would otherwise ping-pong with our notifications
export function isAutoReply(headers: Record<string, string> | null) {
  if (!headers) return false
  const h = (k: string) => String(headers[k] ?? headers[k.toLowerCase()] ?? '').toLowerCase()
  return (h('auto-submitted') !== '' && h('auto-submitted') !== 'no')
    || /bulk|junk|list|auto_reply/.test(h('precedence'))
    || h('x-autoreply') !== '' || h('x-autorespond') !== ''
}

export function senderAddress(from: string) {
  const m = from.match(/<([^>]+)>/)
  return (m?.[1] ?? from).trim().toLowerCase()
}

function htmlToText(html: string) {
  let s = html
  if (s.startsWith('data:')) {
    const [meta, data = ''] = s.split(',', 2)
    s = meta!.includes(';base64') ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data)
  }
  return s
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&')
}

// Keeps only what the sender wrote: everything from our marker or a client's quote header down is dropped
export function replyText(mail: Pick<Received, 'text' | 'html'>) {
  const raw = (mail.text || (mail.html ? htmlToText(mail.html) : '')).replace(/\r\n/g, '\n')
  const cuts = [
    raw.indexOf(REPLY_MARKER),
    raw.search(/^>?\s*On .{1,200}wrote:\s*$/m),
    // Gmail wraps "On … wrote:" across two lines
    raw.search(/^On .{1,200}\n.{0,200}wrote:\s*$/m),
    raw.search(/^-{2,}\s*Original Message\s*-{2,}/im),
    raw.search(/^_{10,}\s*$/m),
    raw.search(/^From: .+\n(?:Sent|Date): /m)
  ].filter(i => i >= 0)
  const text = cuts.length ? raw.slice(0, Math.min(...cuts)) : raw
  const lines = text.split('\n')
  const sig = lines.findIndex(l => l === '-- ' || l === '--')
  return (sig >= 0 ? lines.slice(0, sig) : lines).filter(l => !l.startsWith('>')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// "/note" on the first line = internal note; "/resolve" or "/close" on the last line sets the status
export function staffCommands(body: string): { error: 'unknown command' } | { body: string, internal: boolean, status?: 'resolved' | 'closed' } {
  const lines = body.split('\n')
  let internal = false
  let status: 'resolved' | 'closed' | undefined
  const first = lines[0]?.trim() ?? ''
  if (/^\/note(\s|$)/i.test(first)) {
    internal = true
    lines[0] = first.replace(/^\/note\s*/i, '')
  } else if (first.startsWith('/')) {
    // A mistyped command must never turn a private note into a public reply
    return { error: 'unknown command' as const }
  }
  const last = lines.at(-1)?.trim().toLowerCase() ?? ''
  if (last === '/resolve' || last === '/close') {
    status = last === '/resolve' ? 'resolved' : 'closed'
    lines.pop()
  } else if (/^\/\w+$/.test(last)) {
    return { error: 'unknown command' as const }
  }
  return { body: lines.join('\n').trim(), internal, status }
}

// Recipient forms we accept: support+<replyKey>@domain (existing ticket) or support@domain (new ticket)
export function matchRecipient(addresses: string[]): { replyKey: string | null } | null {
  const [local, domain] = String(useRuntimeConfig().supportInboundAddress).toLowerCase().split('@')
  if (!local || !domain) return null
  for (const a of addresses.map(senderAddress)) {
    const [l, d] = a.split('@')
    if (d !== domain || !l) continue
    if (l === local) return { replyKey: null }
    const plus: RegExpMatchArray | null = l.match(/^(.+)\+([a-f0-9]{20})$/)
    if (plus && plus[1] === local) return { replyKey: plus[2]! }
  }
  return null
}
