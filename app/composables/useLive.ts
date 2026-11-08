import { io, type Socket } from 'socket.io-client'

export type LiveEvent = {
  id: number
  ts: string
  channel: string
  level: string
  text: string
  data: Record<string, unknown>
  templateId: string | null
  traceId: string | null
  spanId: string | null
  values: string[]
}
export type LiveBatch = { events: LiveEvent[], templates: TemplateRow[], newTemplates: string[] }
export type LiveStatus = 'connecting' | 'live' | 'offline'

let socket: Socket | null = null
const status = ref<LiveStatus>('connecting')
const listeners = new Set<(b: LiveBatch) => void>()
let subscribed: { org: string, project: string } | null = null

function subscribe() {
  if (!socket?.connected || !subscribed) return
  socket.emit('subscribe', subscribed, (res: { ok: boolean }) => {
    status.value = res?.ok ? 'live' : 'offline'
  })
}

function connect() {
  if (socket) return
  socket = io({ withCredentials: true })
  socket.on('connect', subscribe)
  socket.on('resubscribe', subscribe)
  socket.on('disconnect', () => { status.value = 'connecting' })
  socket.on('connect_error', () => { status.value = 'offline' })
  socket.on('logs', (b: LiveBatch) => listeners.forEach(fn => fn(b)))
}

// One socket per tab, subscribed to the project in the URL while a live page is open
export function useProjectLive(onBatch: (b: LiveBatch) => void) {
  const { org, project } = useProjectPath()
  if (import.meta.server) return { status }

  onMounted(() => {
    connect()
    listeners.add(onBatch)
    subscribed = { org: org.value, project: project.value }
    status.value = socket!.connected ? status.value : 'connecting'
    subscribe()
  })
  watch([org, project], ([o, p]) => {
    subscribed = { org: o, project: p }
    subscribe()
  })
  onBeforeUnmount(() => {
    listeners.delete(onBatch)
    if (!listeners.size) {
      subscribed = null
      socket?.emit('unsubscribe')
    }
  })
  return { status }
}
