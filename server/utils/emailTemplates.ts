// Branded transactional emails. Table layout + inline styles, because mail clients ignore most CSS.
// Every value that comes from a user goes through esc().

export type Email = { subject: string, html: string, text: string }

const C = { ink: '#15211f', muted: '#5e6b68', line: '#d3dbd7', paper: '#f1f4f1', card: '#ffffff', tide: '#1e8b7e', tideDark: '#0e655c', code: '#eef8f6' }
const FONT = `'Readex Pro','Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const MONO = `'Fragment Mono',ui-monospace,Menlo,Consolas,monospace`

export const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[ch]!)

const p = (html: string) => `<p style="margin:0 0 16px;font:16px/1.6 ${FONT};color:${C.ink}">${html}</p>`
const small = (html: string) => `<p style="margin:16px 0 0;font:13px/1.6 ${FONT};color:${C.muted}">${html}</p>`
const button = (label: string, href: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:8px;background:${C.tide}">
<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a>
</td></tr></table>`
const codeBox = (code: string) => `
<div style="margin:8px 0 20px;padding:18px 0;border-radius:10px;background:${C.code};text-align:center;font:600 32px/1 ${MONO};letter-spacing:10px;color:${C.tideDark}">${esc(code)}</div>`
const facts = (rows: [string, string][]) => `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 20px;border-top:1px solid ${C.line}">
${rows.map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font:14px/1.4 ${FONT};color:${C.muted};width:38%">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font:14px/1.4 ${FONT};color:${C.ink}">${esc(v)}</td></tr>`).join('')}
</table>`

function layout(opts: { preheader: string, title: string, body: string, footer?: string }) {
  const app = String(useRuntimeConfig().appUrl).replace(/\/$/, '')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px">
<a href="${esc(app)}" style="text-decoration:none;font:600 18px/1 ${FONT};color:${C.ink}">
<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${C.tide};margin-right:8px"></span>LogsTrace<span style="font-weight:400;color:${C.muted}">.dev</span></a>
</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:32px 32px 28px">
<h1 style="margin:0 0 18px;font:600 22px/1.3 ${FONT};color:${C.ink}">${esc(opts.title)}</h1>
${opts.body}
</td></tr>
<tr><td style="padding:18px 4px 0;font:12px/1.6 ${FONT};color:${C.muted}">
${opts.footer ?? 'You get this email because of your LogsTrace account.'}<br>
<a href="${esc(app)}" style="color:${C.muted}">${esc(app.replace(/^https?:\/\//, ''))}</a>
</td></tr>
</table></td></tr></table></body></html>`
}

const greet = (name: string) => `Hi ${esc(name.split(' ')[0] || name)},`

export function verifyCodeEmail(name: string, code: string, link: string, minutes: number): Email {
  return {
    subject: `${code} is your LogsTrace verification code`,
    html: layout({
      preheader: `Your code is ${code}. It expires in ${minutes} minutes.`,
      title: 'Confirm your email',
      body: p(greet(name)) + p('Enter this code in LogsTrace to confirm your email address:') + codeBox(code)
        + p('Or confirm with one click:') + button('Confirm email', link)
        + small(`The code and link expire in ${minutes} minutes and work once. If you didn't create a LogsTrace account, ignore this email.`)
    }),
    text: `${name},

Your LogsTrace verification code is ${code}.

Or confirm with this link:
${link}

Both expire in ${minutes} minutes. If you didn't create a LogsTrace account, ignore this email.`
  }
}

export function resetPasswordEmail(name: string, link: string): Email {
  return {
    subject: 'Reset your LogsTrace password',
    html: layout({
      preheader: 'Choose a new password. The link works for 30 minutes.',
      title: 'Reset your password',
      body: p(greet(name)) + p('Someone asked to reset the password for your LogsTrace account. If it was you, choose a new one:')
        + button('Choose a new password', link)
        + small('The link works for 30 minutes and only once. If you didn’t ask for this, you can ignore this email; your password stays the same.')
    }),
    text: `${name},\n\nChoose a new password:\n${link}\n\nThe link works for 30 minutes. If you didn't ask for this, ignore this email.`
  }
}

export function inviteEmail(inviter: string, org: string, role: string, link: string): Email {
  return {
    subject: `${inviter} invited you to ${org} on LogsTrace`,
    html: layout({
      preheader: `Join ${org} as ${role}.`,
      title: `Join ${org} on LogsTrace`,
      body: p(`${esc(inviter)} invited you to the <strong>${esc(org)}</strong> organization as <strong>${esc(role)}</strong>.`)
        + p('LogsTrace sorts an app’s log messages into tables you can search, chart and get alerts on.')
        + button('Accept invitation', link)
        + small('The invitation works for 7 days. If you weren’t expecting it, ignore this email.'),
      footer: 'You get this email because someone invited this address to LogsTrace.'
    }),
    text: `${inviter} invited you to ${org} on LogsTrace as ${role}.\n\nAccept the invitation:\n${link}\n\nIt works for 7 days.`
  }
}

type Where = { device: string, ip: string | null, at: Date }
const whereRows = (w: Where): [string, string][] => [
  ['When', w.at.toUTCString()],
  ['Device', w.device],
  ...(w.ip ? [['IP address', w.ip] as [string, string]] : [])
]

export function newSignInEmail(name: string, w: Where, securityLink: string): Email {
  return {
    subject: 'New sign-in to your LogsTrace account',
    html: layout({
      preheader: `Signed in from ${w.device}.`,
      title: 'New sign-in',
      body: p(greet(name)) + p('Your account was just used to sign in from a device we haven’t seen before:') + facts(whereRows(w))
        + p('If this was you, there’s nothing to do. If not, change your password and sign out of other devices now:')
        + button('Review account security', securityLink)
        + small('You can turn these emails off in Account and security.')
    }),
    text: `${name},\n\nNew sign-in to your LogsTrace account.\nWhen: ${w.at.toUTCString()}\nDevice: ${w.device}${w.ip ? `\nIP: ${w.ip}` : ''}\n\nIf this wasn't you, change your password: ${securityLink}`
  }
}

export function securityChangeEmail(name: string, change: 'password_changed' | 'password_reset' | '2fa_enabled' | '2fa_disabled' | 'recovery_regenerated' | '2fa_failed', w: Where, securityLink: string): Email {
  const what = {
    password_changed: { title: 'Your password was changed', line: 'The password for your LogsTrace account was just changed. Other devices were signed out.' },
    password_reset: { title: 'Your password was reset', line: 'The password for your LogsTrace account was just reset with an emailed link.' },
    '2fa_enabled': { title: 'Two-step sign-in is on', line: 'Signing in now also needs a code from your authenticator app. Keep your recovery codes somewhere safe.' },
    '2fa_disabled': { title: 'Two-step sign-in was turned off', line: 'Signing in to your account now needs only your password.' },
    recovery_regenerated: { title: 'New recovery codes', line: 'New recovery codes were created for your account. The old ones no longer work.' },
    '2fa_failed': { title: 'Someone knows your password', line: 'Your password was entered correctly, but the two-step code was wrong several times. Two-step sign-in stopped them. Change your password now.' }
  }[change]
  return {
    subject: what.title,
    html: layout({
      preheader: what.line,
      title: what.title,
      body: p(greet(name)) + p(what.line) + facts(whereRows(w))
        + p('If you didn’t do this, reset your password now and review your account:') + button('Review account security', securityLink)
    }),
    text: `${name},\n\n${what.line}\nWhen: ${w.at.toUTCString()}\nDevice: ${w.device}${w.ip ? `\nIP: ${w.ip}` : ''}\n\nIf you didn't do this: ${securityLink}`
  }
}

// Inbound replies are cut at this line, so quoted history never lands in a ticket
export const REPLY_MARKER = '## Reply above this line ##'

type TicketRef = { number: number, subject: string }
const quote = (text: string) => `
<div style="margin:4px 0 20px;padding:14px 16px;border-left:3px solid ${C.tide};background:${C.paper};border-radius:0 8px 8px 0;font:15px/1.6 ${FONT};color:${C.ink};white-space:pre-wrap;word-break:break-word">${esc(text)}</div>`
const marker = (on: boolean) => on ? `<p style="margin:0 0 18px;font:12px/1.4 ${MONO};color:${C.muted}">${REPLY_MARKER}</p>` : ''
const textMarker = (on: boolean) => on ? `${REPLY_MARKER}\n\n` : ''
const ticketSubject = (t: TicketRef) => `[#${t.number}] ${t.subject}`
const replyHint = (on: boolean) => on ? 'You can reply to this email or answer in LogsTrace.' : 'Answer in LogsTrace; replies to this email are not read.'

export function ticketReceivedEmail(name: string, t: TicketRef, body: string, link: string, byEmail: boolean): Email {
  return {
    subject: ticketSubject(t),
    html: layout({
      preheader: `We got your request #${t.number}.`,
      title: `We got your request #${t.number}`,
      body: marker(byEmail) + p(greet(name)) + p(`Thanks for writing. Our team will answer <strong>${esc(t.subject)}</strong> as soon as possible.`)
        + quote(body) + button('View request', link) + small(replyHint(byEmail))
    }),
    text: `${textMarker(byEmail)}${name},\n\nWe got your request #${t.number}: ${t.subject}\n\n${body}\n\nView it: ${link}\n\n${replyHint(byEmail)}`
  }
}

export function ticketReplyEmail(name: string, t: TicketRef, from: string, body: string, link: string, byEmail: boolean): Email {
  return {
    subject: `Re: ${ticketSubject(t)}`,
    html: layout({
      preheader: body.slice(0, 120),
      title: `New reply on #${t.number}`,
      body: marker(byEmail) + p(`${esc(from)} answered your request <strong>${esc(t.subject)}</strong>:`)
        + quote(body) + button('View conversation', link) + small(replyHint(byEmail))
    }),
    text: `${textMarker(byEmail)}${from} answered your request #${t.number} (${t.subject}):\n\n${body}\n\nView it: ${link}\n\n${replyHint(byEmail)}`
  }
}

export function ticketStatusEmail(name: string, t: TicketRef, status: 'resolved' | 'closed', link: string, byEmail: boolean): Email {
  const line = status === 'resolved'
    ? 'We marked your request as resolved. If something is still wrong, just reply and it opens again.'
    : 'Your request is closed. If you need more help, open a new request (or reply to this email to start one).'
  return {
    subject: `Re: ${ticketSubject(t)}`,
    html: layout({
      preheader: line,
      title: status === 'resolved' ? `#${t.number} is resolved` : `#${t.number} is closed`,
      body: marker(byEmail) + p(greet(name)) + p(line) + button('View request', link)
    }),
    text: `${textMarker(byEmail)}${name},\n\n${line}\n\n${link}`
  }
}

export type StaffTicketEvent = 'new' | 'reply' | 'reopened' | 'assigned'
export function ticketStaffEmail(kind: StaffTicketEvent, t: TicketRef & { priority: string, category: string }, requester: string, body: string | null, link: string, byEmail: boolean): Email {
  const title = { new: `New request #${t.number}`, reply: `${requester} replied on #${t.number}`, reopened: `#${t.number} was reopened`, assigned: `#${t.number} was assigned to you` }[kind]
  const rows: [string, string][] = [['Requester', requester], ['Category', t.category], ['Priority', t.priority]]
  const hint = byEmail ? 'Reply to this email to answer the requester. Start with /note for an internal note, or end with /resolve to resolve.' : 'Answer in LogsTrace.'
  return {
    subject: `${kind === 'new' ? '' : 'Re: '}${ticketSubject(t)}`,
    html: layout({
      preheader: body ? body.slice(0, 120) : title,
      title,
      body: marker(byEmail) + p(`<strong>${esc(t.subject)}</strong>`) + facts(rows) + (body ? quote(body) : '')
        + button('Open in support inbox', link) + small(esc(hint)),
      footer: 'You get this email because you are on the LogsTrace support team.'
    }),
    text: `${textMarker(byEmail)}${title}\n${t.subject}\nRequester: ${requester}\nCategory: ${t.category}\nPriority: ${t.priority}\n\n${body ?? ''}\n\n${link}\n\n${hint}`
  }
}
