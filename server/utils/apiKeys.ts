import type { H3Event } from 'h3'

export type KeyScope = 'ingest' | 'read'
type CachedKey = { id: string, projectId: string, revoked: boolean, scopes: string[], readSensitive: boolean, at: number, lastUsedWrite: number }
const CACHE_MS = 60_000
// Read keys see data, so a revoke on another instance must bite quickly
const READ_CACHE_MS = 10_000
const cache = new Map<string, CachedKey>()

export async function requireApiKey(event: H3Event, scope: KeyScope) {
  const header = getRequestHeader(event, 'authorization') ?? ''
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!key.startsWith('lgk_') || key.length > 100) {
    throw createError({ statusCode: 401, statusMessage: 'Send your project API key as: Authorization: Bearer lgk_...' })
  }
  const hash = sha256(key)
  let entry = cache.get(hash)
  const ttl = entry?.scopes.includes('read') ? READ_CACHE_MS : CACHE_MS
  if (!entry || Date.now() - entry.at > ttl) {
    const k = schema.apiKeys
    const [row] = await useDb().select({ id: k.id, projectId: k.projectId, revokedAt: k.revokedAt, scopes: k.scopes, readSensitive: k.readSensitive })
      .from(k).where(eq(k.keyHash, hash)).limit(1)
    if (!row) {
      // Unknown keys aren't cached (random keys would evict real ones); guessing is rate limited per IP
      await enforceRateLimit(event, `apikey-miss:ip:${clientIp(event)}`, 30, 60)
      throw createError({ statusCode: 401, statusMessage: 'This API key is invalid or revoked.' })
    }
    entry = { id: row.id, projectId: row.projectId, revoked: !!row.revokedAt, scopes: row.scopes, readSensitive: row.readSensitive, at: Date.now(), lastUsedWrite: entry?.lastUsedWrite ?? 0 }
    if (cache.size > 5000) cache.clear()
    cache.set(hash, entry)
  }
  if (entry.revoked) throw createError({ statusCode: 401, statusMessage: 'This API key is invalid or revoked.' })
  if (!entry.scopes.includes(scope)) {
    throw createError({ statusCode: 403, statusMessage: scope === 'read' ? 'This key can only send logs. Create a key with read access.' : 'This key can only read logs.' })
  }

  if (Date.now() - entry.lastUsedWrite > CACHE_MS) {
    entry.lastUsedWrite = Date.now()
    await useDb().update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, entry.id))
  }
  return { keyId: entry.id, projectId: entry.projectId, readSensitive: entry.readSensitive }
}

// Revoking a key must take effect at once on this instance
export function forgetApiKeys() {
  cache.clear()
}
