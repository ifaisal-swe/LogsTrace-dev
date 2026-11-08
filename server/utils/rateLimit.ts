import type { H3Event } from 'h3'

// Fixed-window counter in Postgres so limits hold across restarts and multiple app instances
export async function hitRateLimit(key: string, limit: number, windowSeconds: number) {
  const client = useDbClient()
  // Drizzle turns off postgres.js date parsing on this client, so timestamps arrive as strings
  const [row] = await client<{ count: number, reset_at: string }[]>`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
    returning count, reset_at`
  return { allowed: row!.count <= limit, retryAfter: Math.max(1, Math.ceil((new Date(row!.reset_at).getTime() - Date.now()) / 1000)) }
}

export async function enforceRateLimit(event: H3Event, key: string, limit: number, windowSeconds: number) {
  const { allowed, retryAfter } = await hitRateLimit(key, limit, windowSeconds)
  if (!allowed) {
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({ statusCode: 429, statusMessage: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` })
  }
}
