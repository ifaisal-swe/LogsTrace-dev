import type { H3Event } from 'h3'
import type { z } from 'zod'
import { isIP } from 'node:net'

// The leftmost X-Forwarded-For entry is client-controlled; use the hop our own proxy appended,
// or a header the proxy sets itself (NUXT_TRUSTED_IP_HEADER, e.g. cf-connecting-ip)
export function clientIp(event: H3Event) {
  const header = String(useRuntimeConfig().trustedIpHeader || 'x-forwarded-for').toLowerCase()
  const ip = getRequestHeader(event, header)?.split(',').at(-1)?.trim()
  return (ip && isIP(ip) ? ip : getRequestIP(event)) ?? 'unknown'
}

export function userAgent(event: H3Event) {
  return (getRequestHeader(event, 'user-agent') ?? '').slice(0, 300)
}

export async function readValidated<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const body = await readBody(event).catch(() => null)
  const result = schema.safeParse(body)
  if (!result.success) {
    const first = result.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: { field: first?.path.join('.'), message: first?.message ?? 'Check the form and try again.' }
    })
  }
  return result.data
}

export function getUuidParam(event: H3Event, name: string) {
  const value = getRouterParam(event, name) ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return value
}
