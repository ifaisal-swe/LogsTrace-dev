import type { H3Event } from 'h3'
import type { Email } from './emailTemplates'

// Transactional email through Resend (https://resend.com). Without NUXT_RESEND_API_KEY,
// development prints messages to the console and production refuses, so nothing is lost silently.

export type MailOptions = { replyTo?: string, headers?: Record<string, string> }

export async function sendMail(to: string, email: Email, opts: MailOptions = {}) {
  const { resendApiKey, mailFrom, mailReplyTo } = useRuntimeConfig()
  if (!resendApiKey) {
    if (!import.meta.dev) {
      console.error('[mail] NUXT_RESEND_API_KEY is not set; email not sent:', email.subject)
      throw createError({ statusCode: 503, statusMessage: 'Email is not configured on this server.' })
    }
    console.info(`\n[mail] to=${to}\n[mail] subject=${email.subject}\n${email.text}\n`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: mailFrom,
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(opts.replyTo || mailReplyTo ? { reply_to: opts.replyTo || mailReplyTo } : {}),
      ...(opts.headers ? { headers: opts.headers } : {})
    }),
    signal: AbortSignal.timeout(10_000)
  }).catch((err) => {
    console.error('[mail] Resend unreachable', err?.message)
    return null
  })
  if (!res?.ok) {
    const detail = res ? (await res.text().catch(() => '')).slice(0, 300) : 'no response'
    console.error('[mail] Resend rejected', res?.status, detail)
    throw createError({ statusCode: 502, statusMessage: 'We could not send the email right now. Try again in a minute.' })
  }
}

export function appLink(path: string) {
  return new URL(path, useRuntimeConfig().appUrl).toString()
}

// "Chrome on Windows" from a user agent, for security emails and the sessions list
export function describeDevice(ua: string | null) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'A browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

// Security notices are best-effort: a mail outage must not undo a password change or a sign-in
export async function sendSecurityEmail(event: H3Event, user: { id: string, email: string, name: string }, build: (where: { device: string, ip: string | null, at: Date }, link: string) => Email) {
  try {
    await sendMail(user.email, build({ device: describeDevice(userAgent(event)), ip: clientIp(event), at: new Date() }, appLink('/app/account')))
  } catch (err) {
    console.error('[mail] security email failed', (err as { statusMessage?: string }).statusMessage ?? err)
  }
}
