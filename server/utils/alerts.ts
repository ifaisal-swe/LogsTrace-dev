import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { z } from 'zod'

export const alertConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('level'), minLevel: z.enum(['warn', 'error', 'fatal']), channel: z.string().trim().max(100).optional(), templateId: z.string().uuid().optional() }),
  z.object({ kind: z.literal('new_table') }),
  z.object({
    kind: z.literal('text'),
    contains: z.string().trim().min(2).max(200),
    level: z.enum(LOG_LEVELS).optional(),
    channel: z.string().trim().max(100).optional(),
    templateId: z.string().uuid().optional()
  }),
  z.object({
    kind: z.literal('volume'),
    threshold: z.number().int().min(1).max(10_000_000),
    windowMinutes: z.number().int().min(1).max(1440),
    level: z.enum(LOG_LEVELS).optional(),
    channel: z.string().trim().max(100).optional(),
    templateId: z.string().uuid().optional()
  })
])

const DESTINATION_HOSTS: Record<string, RegExp | null> = {
  discord: /^(?:canary\.|ptb\.)?(?:discord|discordapp)\.com$/,
  slack: /^hooks\.slack\.com$/,
  webhook: null
}

// Blocks loopback, private, link-local, CGNAT, multicast and other non-public ranges
function isPublicAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
      || ip.startsWith('192.0.0.') || ip.startsWith('192.0.2.') || ip.startsWith('198.51.100.') || ip.startsWith('203.0.113.'))
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return isPublicAddress(v.slice(7))
  // IPv4-compatible (::a.b.c.d), NAT64 and 6to4 can wrap private IPv4 addresses
  if (/^::\d/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2002:')) return false
  return !(v === '::' || v === '::1' || /^f[c-f]/.test(v))
}

export async function checkWebhookUrl(destination: string, raw: string) {
  let url: URL
  try { url = new URL(raw) } catch { throw createError({ statusCode: 400, statusMessage: 'Enter a full webhook URL.' }) }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw createError({ statusCode: 400, statusMessage: 'Webhooks must use https on the default port.' })
  }
  const allowed = DESTINATION_HOSTS[destination]
  if (allowed && !allowed.test(url.hostname)) throw createError({ statusCode: 400, statusMessage: `That isn't a ${destination === 'discord' ? 'Discord' : 'Slack'} webhook URL.` })
  if (destination === 'discord' && !url.pathname.startsWith('/api/webhooks/')) throw createError({ statusCode: 400, statusMessage: 'Discord webhook URLs look like https://discord.com/api/webhooks/…' })
  if (isIP(url.hostname)) throw createError({ statusCode: 400, statusMessage: 'Use a host name, not an IP address.' })
  const addresses = await lookup(url.hostname, { all: true }).catch(() => [])
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) {
    throw createError({ statusCode: 400, statusMessage: 'That host does not resolve to a public address.' })
  }
  return url
}

export const maskUrl = (raw: string) => {
  try {
    const u = new URL(raw)
    return `${u.origin}${u.pathname.length > 16 ? `${u.pathname.slice(0, 16)}…` : u.pathname}`
  } catch { return '••••' }
}

type Rule = typeof schema.alertRules.$inferSelect
type AlertEvent = { level: string, channel: string, text: string, ts: Date, templateId: string | null }
type Message = { title: string, lines: string[], event?: AlertEvent, link: string }

const COLORS: Record<string, number> = { fatal: 0x8b1e1e, error: 0xe34948, warn: 0xeda100 }

// Log data is attacker-controlled: no mentions, links or broken-out code blocks in chat apps
const noFence = (s: string) => s.replace(/`/g, 'ˋ')
const slackSafe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const discordSafe = (s: string) => s.replace(/[\\*_~|`[\]()<>@#]/g, m => `\\${m}`)

function payload(rule: Rule, m: Message) {
  // Webhooks leave the platform, so text is always masked regardless of who created the rule
  const text = m.event ? noFence(maskText(m.event.text).slice(0, 1500)) : ''
  if (rule.destination === 'discord') {
    return {
      username: 'LogsTrace',
      embeds: [{
        title: m.title.slice(0, 240),
        description: [...m.lines.map(discordSafe), text && `\`\`\`\n${text}\n\`\`\``].filter(Boolean).join('\n').slice(0, 3900),
        color: COLORS[m.event?.level ?? ''] ?? 0x1e8b7e,
        url: m.link,
        timestamp: (m.event?.ts ?? new Date()).toISOString()
      }],
      allowed_mentions: { parse: [] }
    }
  }
  if (rule.destination === 'slack') {
    return { text: [`*${slackSafe(m.title)}*`, ...m.lines.map(slackSafe), text && `\`\`\`${slackSafe(text)}\`\`\``, m.link].filter(Boolean).join('\n') }
  }
  return { rule: { id: rule.id, name: rule.name }, title: m.title, details: m.lines, link: m.link, event: m.event ? { ...m.event, text, ts: m.event.ts.toISOString() } : null }
}

export async function sendWebhook(rule: Rule, m: Message) {
  try {
    await checkWebhookUrl(rule.destination, rule.url)
    const res = await fetch(rule.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'LogsTrace-Alerts' },
      body: JSON.stringify(payload(rule, m)),
      redirect: 'manual',
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await useDb().update(schema.alertRules).set({ lastError: null }).where(eq(schema.alertRules.id, rule.id))
    return true
  } catch (err) {
    const message = (err as { statusMessage?: string, message?: string }).statusMessage ?? (err as Error).message ?? 'failed'
    await useDb().update(schema.alertRules).set({ lastError: message.slice(0, 200) }).where(eq(schema.alertRules.id, rule.id))
    return false
  }
}

// Atomic across app instances: only the instance that moves last_fired_at forward sends.
// Returns the stored rule, so a rule disabled or re-pointed elsewhere is never sent with stale settings.
async function claim(rule: Rule) {
  const r = schema.alertRules
  const [row] = await useDb().update(r).set({ lastFiredAt: new Date() })
    .where(and(eq(r.id, rule.id), eq(r.enabled, true), sql`(${r.lastFiredAt} is null or ${r.lastFiredAt} < now() - make_interval(mins => ${r.cooldownMinutes}))`))
    .returning()
  return row ?? null
}

async function projectLink(projectId: string, path = '') {
  const [p] = await useDb().select({ slug: schema.projects.slug, org: schema.organizations.slug, name: schema.projects.name })
    .from(schema.projects).innerJoin(schema.organizations, eq(schema.organizations.id, schema.projects.orgId))
    .where(eq(schema.projects.id, projectId)).limit(1)
  const base = String(useRuntimeConfig().appUrl || '').replace(/\/$/, '')
  return { name: p?.name ?? 'project', url: p ? `${base}/o/${p.org}/p/${p.slug}${path}` : base }
}

const ruleCache = new Map<string, { at: number, rules: Rule[] }>()
async function enabledRules(projectId: string) {
  const hit = ruleCache.get(projectId)
  if (hit && Date.now() - hit.at < 30_000) return hit.rules
  const rules = await useDb().select().from(schema.alertRules)
    .where(and(eq(schema.alertRules.projectId, projectId), eq(schema.alertRules.enabled, true)))
  if (ruleCache.size > 2000) ruleCache.clear()
  ruleCache.set(projectId, { at: Date.now(), rules })
  return rules
}
export function forgetAlertRules(projectId: string) {
  ruleCache.delete(projectId)
}

// Level and new-table rules react to each ingest batch
export async function checkIngestAlerts(projectId: string, events: AlertEvent[], newTemplateIds: string[]) {
  const rules = (await enabledRules(projectId)).filter(r => r.condition.kind !== 'volume')
  if (!rules.length) return
  for (const rule of rules) {
    const c = rule.condition
    if (c.kind === 'level') {
      const min = LEVEL_RANK[c.minLevel]
      const hits = events.filter(e => (LEVEL_RANK[e.level as LogLevel] ?? 0) >= min
        && (c.channel === undefined || e.channel === c.channel) && (!c.templateId || e.templateId === c.templateId))
      const fresh = hits.length ? await claim(rule) : null
      if (!fresh) continue
      const p = await projectLink(projectId, '/logs')
      const first = hits[0]!
      await sendWebhook(fresh, {
        title: `${LEVEL_LABELS[first.level as LogLevel] ?? first.level} in ${p.name}${first.channel ? ` #${maskText(first.channel).slice(0, 60)}` : ''}`,
        lines: [`Rule: ${rule.name}`, hits.length > 1 ? `${hits.length} matching messages in this batch.` : ''].filter(Boolean),
        event: first,
        link: p.url
      })
    } else if (c.kind === 'text') {
      // Matched on masked text so a rule can't be used to probe hidden values
      const needle = c.contains.toLowerCase()
      const hits = events.filter(e => (!c.level || e.level === c.level)
        && (c.channel === undefined || e.channel === c.channel) && (!c.templateId || e.templateId === c.templateId)
        && maskText(e.text).toLowerCase().includes(needle))
      const fresh = hits.length ? await claim(rule) : null
      if (!fresh) continue
      const p = await projectLink(projectId, '/logs')
      await sendWebhook(fresh, {
        title: `"${maskText(c.contains).slice(0, 80)}" in ${p.name}`,
        lines: [`Rule: ${rule.name}`, hits.length > 1 ? `${hits.length} matching messages in this batch.` : ''].filter(Boolean),
        event: hits[0],
        link: p.url
      })
    } else if (c.kind === 'new_table' && newTemplateIds.length) {
      const fresh = await claim(rule)
      if (!fresh) continue
      const [t] = await useDb().select({ pattern: schema.logTemplates.pattern, channel: schema.logTemplates.channel })
        .from(schema.logTemplates).where(inArray(schema.logTemplates.id, newTemplateIds)).limit(1)
      const p = await projectLink(projectId, `/templates/${newTemplateIds[0]}`)
      await sendWebhook(fresh, {
        title: `New kind of message in ${p.name}`,
        lines: [`Rule: ${rule.name}`, t ? `Pattern: ${maskText(t.pattern).slice(0, 300)}` : '', newTemplateIds.length > 1 ? `${newTemplateIds.length} new tables in this batch.` : ''].filter(Boolean),
        link: p.url
      })
    }
  }
}

// Volume rules are checked on a timer (server/plugins/alerts.ts)
export async function checkVolumeAlerts() {
  const rules = await useDb().select().from(schema.alertRules)
    .where(and(eq(schema.alertRules.enabled, true), sql`${schema.alertRules.condition}->>'kind' = 'volume'`))
  for (const rule of rules) {
    const c = rule.condition
    if (c.kind !== 'volume') continue
    if (rule.lastFiredAt && Date.now() - rule.lastFiredAt.getTime() < rule.cooldownMinutes * 60_000) continue
    if (await countRecent(rule.projectId, c) < c.threshold) continue
    const fresh = await claim(rule)
    if (!fresh) continue
    const p = await projectLink(rule.projectId, '/logs')
    await sendWebhook(fresh, {
      title: `${c.threshold.toLocaleString('en')}+ messages in ${c.windowMinutes} min in ${p.name}`,
      lines: [`Rule: ${rule.name}`, [c.level && `level ${c.level}`, c.channel && `#${maskText(c.channel)}`].filter(Boolean).join(', ')].filter(Boolean),
      link: p.url
    })
  }
}
