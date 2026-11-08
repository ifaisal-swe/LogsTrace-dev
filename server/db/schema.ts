import { sql } from 'drizzle-orm'
import {
  bigint, bigserial, boolean, index, integer, jsonb, pgEnum, pgSequence, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid
} from 'drizzle-orm/pg-core'
import type { TicketCategory, TicketPriority, TicketStatus } from '../../shared/utils/tickets'

// moderator = support staff: answers tickets, no account management
export const platformRole = pgEnum('platform_role', ['user', 'moderator', 'admin'])
export const orgRole = pgEnum('org_role', ['owner', 'admin', 'member', 'viewer'])
export const tokenType = pgEnum('token_type', ['verify_email', 'reset_password', 'login_2fa'])

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  platformRole: platformRole('platform_role').notNull().default('user'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  // Authenticator-app secret, AES-GCM encrypted with NUXT_SECRET_KEY; pending until the first code is confirmed
  totpSecret: text('totp_secret'),
  totpPendingSecret: text('totp_pending_secret'),
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  // Last accepted 30-second step, so a code can't be replayed
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  loginAlerts: boolean('login_alerts').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)
])

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
}, t => [
  uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
  index('sessions_user_idx').on(t.userId)
])

export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: tokenType('type').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt()
}, t => [
  uniqueIndex('auth_tokens_hash_idx').on(t.tokenHash),
  index('auth_tokens_user_type_idx').on(t.userId, t.type)
])

// One-time codes for signing in without the authenticator app; only hashes are stored
export const recoveryCodes = pgTable('recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt()
}, t => [
  index('recovery_codes_user_idx').on(t.userId)
])

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: createdAt()
}, t => [
  uniqueIndex('organizations_slug_idx').on(t.slug)
])

export const memberships = pgTable('memberships', {
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: orgRole('role').notNull(),
  createdAt: createdAt()
}, t => [
  primaryKey({ columns: [t.orgId, t.userId] }),
  index('memberships_user_idx').on(t.userId)
])

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: orgRole('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: createdAt()
}, t => [
  uniqueIndex('invitations_token_hash_idx').on(t.tokenHash),
  index('invitations_org_idx').on(t.orgId)
])

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  // Messages older than this are deleted by the retention job; null keeps them forever
  retentionDays: integer('retention_days'),
  createdAt: createdAt()
}, t => [
  uniqueIndex('projects_org_slug_idx').on(t.orgId, t.slug)
])

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // First characters shown in the UI so people can tell keys apart; the full key is never stored
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  // ingest = send logs; read = query logs through /api/v1
  scopes: text('scopes').array().notNull().default(sql`'{ingest}'::text[]`),
  // Read keys see masked text unless created with this
  readSensitive: boolean('read_sensitive').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt()
}, t => [
  uniqueIndex('api_keys_hash_idx').on(t.keyHash),
  index('api_keys_project_idx').on(t.projectId)
])

export type TemplateField = { name: string, type: 'number' | 'id' | 'text', position: number }

export const logTemplates = pgTable('log_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull().default(''),
  // Token pattern, variables written as <*>
  pattern: text('pattern').notNull(),
  tokens: jsonb('tokens').$type<string[]>().notNull(),
  name: text('name'),
  description: text('description'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  pinned: boolean('pinned').notNull().default(false),
  // Hidden tables stay queryable but drop out of the default list
  hidden: boolean('hidden').notNull().default(false),
  fields: jsonb('fields').$type<TemplateField[]>().notNull().default([]),
  count: bigint('count', { mode: 'number' }).notNull().default(0),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('log_templates_project_idx').on(t.projectId, t.channel)
])

export type SavedViewKind = 'table' | 'logs'

export const savedViews = pgTable('saved_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => logTemplates.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<SavedViewKind>().notNull(),
  name: text('name').notNull(),
  query: jsonb('query').$type<Record<string, unknown>>().notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, t => [
  index('saved_views_project_idx').on(t.projectId, t.kind)
])

// Panel config is validated by panelSchema (server/utils/dashboards.ts) before it is stored
export const dashboards = pgTable('dashboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  panels: jsonb('panels').$type<Record<string, unknown>[]>().notNull().default([]),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('dashboards_project_idx').on(t.projectId)
])

// Log messages live in ClickHouse; Postgres only hands out their ids so cursors stay numeric and ordered
export const logEventIds = pgSequence('log_event_ids')

// Old copy of the logs from before ClickHouse; no longer read or written. Dropped once the move is confirmed.
export const logEvents = pgTable('log_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  templateId: uuid('template_id').references(() => logTemplates.id, { onDelete: 'set null' }),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  channel: text('channel').notNull().default(''),
  level: text('level').notNull().default('info'),
  text: text('text').notNull(),
  embed: jsonb('embed'),
  // Correlates messages from one request or job (OpenTelemetry-style ids are fine)
  traceId: text('trace_id'),
  spanId: text('span_id'),
  // Structured data sent by the client. Template values are extracted on read, so they follow template changes.
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({})
}, t => [
  index('log_events_project_ts_idx').on(t.projectId, t.ts.desc()),
  index('log_events_template_ts_idx').on(t.templateId, t.ts.desc()),
  index('log_events_trace_idx').on(t.projectId, t.traceId).where(sql`${t.traceId} is not null`),
  index('log_events_text_trgm_idx').using('gin', sql`${t.text} gin_trgm_ops`)
])

export type AlertCondition =
  | { kind: 'level', minLevel: 'warn' | 'error' | 'fatal', channel?: string, templateId?: string }
  | { kind: 'new_table' }
  | { kind: 'text', contains: string, level?: string, channel?: string, templateId?: string }
  | { kind: 'volume', threshold: number, windowMinutes: number, level?: string, channel?: string, templateId?: string }

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  condition: jsonb('condition').$type<AlertCondition>().notNull(),
  destination: text('destination').$type<'discord' | 'slack' | 'webhook'>().notNull(),
  // Webhook URLs are credentials: never returned in full by the API
  url: text('url').notNull(),
  cooldownMinutes: integer('cooldown_minutes').notNull().default(10),
  enabled: boolean('enabled').notNull().default(true),
  lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt()
}, t => [
  index('alert_rules_project_idx').on(t.projectId)
])

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  ip: text('ip'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt()
}, t => [
  index('audit_log_user_idx').on(t.userId, t.createdAt.desc()),
  index('audit_log_org_idx').on(t.orgId, t.createdAt.desc())
])

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull()
})


export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Short number people quote in emails ("#1042")
  number: bigserial('number', { mode: 'number' }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  category: text('category').$type<TicketCategory>().notNull(),
  priority: text('priority').$type<TicketPriority>().notNull().default('normal'),
  // open = staff's turn, waiting = requester's turn
  status: text('status').$type<TicketStatus>().notNull().default('open'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  // Plus-address part of the reply-by-email address; not a credential on its own (sender is checked too)
  replyKey: text('reply_key').notNull(),
  userReadAt: timestamp('user_read_at', { withTimezone: true }),
  staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('tickets_number_idx').on(t.number),
  uniqueIndex('tickets_reply_key_idx').on(t.replyKey),
  index('tickets_user_idx').on(t.userId, t.lastMessageAt.desc()),
  index('tickets_status_idx').on(t.status, t.lastMessageAt.desc())
])

export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  author: text('author').$type<'user' | 'staff' | 'system'>().notNull(),
  body: text('body').notNull(),
  // Staff-only notes; never shown or emailed to the requester
  internal: boolean('internal').notNull().default(false),
  via: text('via').$type<'web' | 'email'>().notNull().default('web'),
  // Inbound Message-ID, so a retried webhook doesn't post the same email twice
  emailMessageId: text('email_message_id'),
  createdAt: createdAt()
}, t => [
  index('ticket_messages_ticket_idx').on(t.ticketId, t.createdAt),
  uniqueIndex('ticket_messages_email_idx').on(t.emailMessageId).where(sql`${t.emailMessageId} is not null`)
])
