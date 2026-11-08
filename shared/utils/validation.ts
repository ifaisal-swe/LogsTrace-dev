import { z } from 'zod'
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from './tickets'

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)

export const passwordSchema = z.string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine(p => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), 'Use both letters and numbers')

// Names appear in invitation emails and other people's dashboards, so they can't carry links,
// addresses or invisible direction-flipping characters (common phishing tricks)
const HIDDEN_CHARS = /[\u0000-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/
const LINK_LIKE = /(?:[a-z][\w+.-]*:\/\/|www\.|@|\b[\w-]+\.(?:com|net|org|io|xyz|sa|co|app|dev|info|me|link|ru|cn|tk|top|site|online|biz|live|click|shop|store|ly|gg|to|in|uk|us|de)\b)/i
const UNSAFE_NAME = 'Names can\'t contain links, email addresses or hidden characters'
export function isSafeDisplayText(value: string) {
  return !HIDDEN_CHARS.test(value) && !LINK_LIKE.test(value)
}

export const nameSchema = z.string().trim().min(2, 'Enter at least 2 characters').max(80)
  .refine(isSafeDisplayText, UNSAFE_NAME)

export const slugSchema = z.string().trim().toLowerCase()
  .min(2, 'Enter at least 2 characters').max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes')

export const registerSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema })
// Client form only; the API takes registerSchema
export const registerFormSchema = registerSchema.extend({ confirmPassword: z.string().max(128) })
  .refine(d => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password').max(128) })
export const forgotSchema = z.object({ email: emailSchema })
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema })
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
export const profileSchema = z.object({ name: nameSchema })

// Two-step sign-in: 6-digit authenticator code, or a recovery code like "abcd-efgh-jkmn"
export const totpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your app')
export const recoveryCodeSchema = z.string().trim().min(10, 'Enter a recovery code').max(20)
export const twoFactorLoginSchema = z.object({
  challenge: z.string().min(20).max(200),
  method: z.enum(['totp', 'recovery']),
  code: z.string().trim().min(6).max(20)
})
export const passwordConfirmSchema = z.object({ password: z.string().min(1, 'Enter your password').max(128) })
export const twoFactorDisableSchema = passwordConfirmSchema.extend({ code: z.string().trim().min(6).max(20) })
export const securitySettingsSchema = z.object({ loginAlerts: z.boolean(), password: z.string().max(128).optional() })

// Addresses (slugs) are derived from the name on the server
export const orgSchema = z.object({ name: nameSchema })
export const projectSchema = z.object({ name: nameSchema })
// null = keep messages forever
export const projectSettingsSchema = z.object({ name: nameSchema, retentionDays: z.number().int().min(1).max(3650).nullable().optional() })
export const inviteSchema = z.object({ email: emailSchema, role: z.enum(['admin', 'member', 'viewer']) })
export const roleChangeSchema = z.object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) })
export const apiKeySchema = z.object({
  name: z.string().trim().min(2).max(60).refine(isSafeDisplayText, UNSAFE_NAME),
  // send = ingest only (safe to put on servers); read = query API; both = either
  access: z.enum(['send', 'read', 'both']).default('send'),
  readSensitive: z.boolean().default(false)
})

export function slugify(input: string) {
  return input.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

// Same-site path for post-login redirects. Rejects //host and /\host, which browsers treat as other sites.
export function safeRedirect(target: unknown, fallback = '/app') {
  const path = typeof target === 'string' ? target : ''
  return /^\/(?![/\\])\S*$/.test(path) ? path : fallback
}

// Subjects may mention domains or addresses (they describe problems), but no hidden/bidi characters
export const ticketSubjectSchema = z.string().trim().min(4, 'Enter at least 4 characters').max(150)
  .refine(v => !HIDDEN_CHARS.test(v), 'The subject contains hidden characters')
// Direction overrides are dropped so a message can't visually reorder text (e.g. fake links)
export const ticketBodySchema = z.string().transform(v => v.replace(/[‪-‮⁦-⁩]/g, '').trim())
  .pipe(z.string().min(1, 'Write a message').max(10_000, 'Keep it under 10,000 characters'))
export const ticketCreateSchema = z.object({
  subject: ticketSubjectSchema,
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  body: ticketBodySchema,
  projectId: z.uuid().optional()
})
export const ticketReplySchema = z.object({ body: ticketBodySchema })
export const ticketUserUpdateSchema = z.object({ status: z.enum(['resolved', 'open']) })
export const ticketStaffReplySchema = z.object({
  body: ticketBodySchema,
  internal: z.boolean().default(false),
  // Status to set together with the reply; default is "waiting" for public replies
  status: z.enum(TICKET_STATUSES).optional()
})
export const ticketStaffUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: z.uuid().nullable().optional()
})
export const ticketListQuerySchema = z.object({
  status: z.enum([...TICKET_STATUSES, 'active', 'all']).default('active'),
  assigned: z.enum(['me', 'none', 'any']).default('any'),
  q: z.string().trim().max(100).optional()
})
