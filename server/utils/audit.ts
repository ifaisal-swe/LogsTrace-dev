import type { H3Event } from 'h3'

export async function audit(event: H3Event | null, action: string, opts: { userId?: string | null, orgId?: string | null, meta?: Record<string, unknown> } = {}) {
  try {
    await useDb().insert(schema.auditLog).values({
      action,
      userId: opts.userId ?? event?.context.user?.id ?? null,
      orgId: opts.orgId ?? null,
      ip: event ? clientIp(event) : null,
      meta: opts.meta ?? {}
    })
  } catch (err) {
    // Auditing must never break the request it records
    console.error('[audit] failed to write', action, err)
  }
  notifyPlatform(action, { userId: opts.userId ?? event?.context.user?.id ?? null, orgId: opts.orgId, meta: opts.meta })
}
