import type { IncomingMessage } from 'node:http'
import { Server as Engine } from 'engine.io'
import { Server, type Socket } from 'socket.io'
import { z } from 'zod'
import { roleCan, type OrgRole } from '#shared/utils/permissions'
import type { LiveNotice } from '../utils/live'

type Sub = { orgId: string, projectId: string, room: string }
type SocketData = { token: string, user: SessionUser, sub?: Sub }
type ClientEvents = {
  subscribe: (raw: unknown, ack?: (res: { ok: boolean }) => void) => void
  unsubscribe: () => void
}
type ServerEvents = { logs: (batch: unknown) => void, resubscribe: () => void }
type LiveSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>

const subscribeSchema = z.object({ org: z.string().min(1).max(100), project: z.string().min(1).max(100) })
const REVALIDATE_MS = 30_000

const roomFor = (projectId: string, role: OrgRole) => `p:${projectId}:${roleCan(role, 'logs:read_sensitive') ? 'full' : 'masked'}`

function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim())
      } catch {
        return undefined
      }
    }
  }
}

// Cookies ride along on cross-site handshakes, so the page must be ours.
// Browsers omit Origin on same-origin GETs (polling) but always send it cross-site and on WebSockets.
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  if (!origin) return req.headers['sec-fetch-site'] === 'same-origin'
  return isAllowedOrigin(origin, req.headers.host)
}

async function resolveProject(userId: string, orgSlug: string, projectSlug: string) {
  const db = useDb()
  const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations)
    .where(eq(schema.organizations.slug, orgSlug)).limit(1)
  if (!org) return null
  const role = await getMembership(userId, org.id)
  if (!role || !roleCan(role, 'logs:read')) return null
  const [project] = await db.select({ id: schema.projects.id }).from(schema.projects)
    .where(and(eq(schema.projects.orgId, org.id), eq(schema.projects.slug, projectSlug))).limit(1)
  if (!project) return null
  return { orgId: org.id, projectId: project.id, room: roomFor(project.id, role) }
}

export default defineNitroPlugin((nitroApp) => {
  const engine = new Engine({ pingInterval: 25_000, maxHttpBufferSize: 10_000 })
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>({ serveClient: false })
  io.bind(engine)

  io.use(async (socket, next) => {
    if (!sameOrigin(socket.request)) return next(new Error('origin'))
    const token = readCookie(socket.request.headers.cookie, SESSION_COOKIE)
    const session = await findSession(token).catch(() => null)
    if (!session || (useRuntimeConfig().requireEmailVerification && !session.user.emailVerified)) return next(new Error('unauthorized'))
    socket.data = { token: token!, user: session.user }
    next()
  })

  io.on('connection', (socket: LiveSocket) => {
    socket.on('subscribe', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const parsed = subscribeSchema.safeParse(raw)
      if (socket.data.sub) await socket.leave(socket.data.sub.room)
      socket.data.sub = undefined
      if (!parsed.success) return ack({ ok: false })
      const sub = await resolveProject(socket.data.user.id, parsed.data.org, parsed.data.project).catch(() => null)
      if (!sub) return ack({ ok: false })
      socket.data.sub = sub
      await socket.join(sub.room)
      ack({ ok: true })
    })
    socket.on('unsubscribe', async () => {
      if (socket.data.sub) await socket.leave(socket.data.sub.room)
      socket.data.sub = undefined
    })
  })

  // Signed-out sessions and removed/changed memberships take effect on open sockets too
  const revalidate = setInterval(async () => {
    for (const socket of io.of('/').sockets.values()) {
      try {
        const session = await findSession(socket.data.token)
        if (!session) { socket.disconnect(true); continue }
        const sub = socket.data.sub
        if (!sub) continue
        const role = await getMembership(session.user.id, sub.orgId)
        const room = role && roleCan(role, 'logs:read') ? roomFor(sub.projectId, role) : null
        if (room === sub.room) continue
        await socket.leave(sub.room)
        if (room) { sub.room = room; await socket.join(room) } else socket.data.sub = undefined
        socket.emit('resubscribe')
      } catch (err) {
        console.error('[live] revalidate failed', err)
      }
    }
  }, REVALIDATE_MS)

  async function fanOut(notice: LiveNotice) {
    const rooms = io.of('/').adapter.rooms
    const full = `p:${notice.p}:full`
    const masked = `p:${notice.p}:masked`
    if (!rooms.has(full) && !rooms.has(masked)) return

    const db = useDb()
    // Ingest waits for the ClickHouse insert before notifying, so these rows are readable
    const events = await logsByIds(notice.p, notice.ids)
    const templateIds = [...new Set([...events.flatMap(ev => ev.templateId ? [ev.templateId] : []), ...notice.t])]
    const t = schema.logTemplates
    const templates = templateIds.length
      ? await db.select({ id: t.id, channel: t.channel, pattern: t.pattern, name: t.name, description: t.description, tags: t.tags, pinned: t.pinned, hidden: t.hidden, fields: t.fields, tokens: t.tokens, count: t.count, firstSeenAt: t.firstSeenAt, lastSeenAt: t.lastSeenAt })
        .from(t).where(and(eq(t.projectId, notice.p), inArray(t.id, templateIds)))
      : []
    const byId = new Map(templates.map(x => [x.id, x]))
    const templateRows = templates.map(({ tokens: _tokens, ...rest }) => rest)
    const maskedTemplateRows = templateRows.map(maskTemplateText)

    for (const [room, sensitive] of [[full, true], [masked, false]] as const) {
      if (!rooms.has(room)) continue
      const items = events.map((ev) => {
        const text = sensitive ? ev.text : maskText(ev.text)
        const tpl = ev.templateId ? byId.get(ev.templateId) : undefined
        const extracted = tpl ? extractValues(tpl.tokens, text) : {}
        return {
          ...ev,
          text,
          data: sensitive ? ev.data : maskData(ev.data) as Record<string, unknown>,
          values: tpl ? tpl.fields.map(f => extracted[f.position] ?? '') : []
        }
      })
      io.to(room).emit('logs', { events: items, templates: sensitive ? templateRows : maskedTemplateRows, newTemplates: notice.t })
    }
  }

  // Serialised so pushes reach clients in ingest order
  let queue = Promise.resolve()
  const listening = useDbClient().listen(LIVE_CHANNEL, (payload) => {
    let notice: LiveNotice
    try {
      notice = JSON.parse(payload)
    } catch {
      return
    }
    queue = queue.then(() => fanOut(notice)).catch(err => console.error('[live] push failed', err))
  })

  nitroApp.router.use('/socket.io/', defineEventHandler({
    handler(event) {
      engine.handleRequest(event.node.req as never, event.node.res)
      event._handled = true
    },
    websocket: {
      open(peer) {
        // Hands the raw upgraded socket to engine.io (the integration from socket.io's Nuxt guide)
        const internal = (peer as unknown as { _internal: { nodeReq: IncomingMessage } })._internal
        // @ts-expect-error private engine.io API
        engine.prepare(internal.nodeReq)
        // @ts-expect-error private engine.io API
        engine.onWebSocket(internal.nodeReq, internal.nodeReq.socket, peer.websocket)
      }
    }
  }))

  nitroApp.hooks.hook('close', async () => {
    clearInterval(revalidate)
    await listening.then(l => l.unlisten()).catch(() => {})
    io.close()
  })
})
