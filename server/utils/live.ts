export const LIVE_CHANNEL = 'lg_live'
// Postgres caps NOTIFY payloads at 8000 bytes
const MAX_PAYLOAD = 7500

export type LiveNotice = { p: string, ids: number[], t: string[] }

// Goes through Postgres so every app instance hears about events, whichever one ingested them
export async function publishLive(projectId: string, ids: number[], newTemplates: string[]) {
  if (!ids.length) return
  const chunks: LiveNotice[] = []
  let cur: LiveNotice = { p: projectId, ids: [], t: [] }
  const size = (n: LiveNotice) => JSON.stringify(n).length
  for (const id of ids) {
    cur.ids.push(id)
    if (size(cur) > MAX_PAYLOAD) { cur.ids.pop(); chunks.push(cur); cur = { p: projectId, ids: [id], t: [] } }
  }
  for (const t of newTemplates) {
    cur.t.push(t)
    if (size(cur) > MAX_PAYLOAD) { cur.t.pop(); chunks.push(cur); cur = { p: projectId, ids: [], t: [t] } }
  }
  chunks.push(cur)
  try {
    const client = useDbClient()
    for (const c of chunks) await client.notify(LIVE_CHANNEL, JSON.stringify(c))
  } catch (err) {
    // Events are already stored; live viewers only miss the push
    console.error('[live] notify failed', err)
  }
}
