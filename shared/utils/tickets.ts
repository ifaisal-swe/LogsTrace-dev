export const TICKET_STATUSES = ['open', 'waiting', 'resolved', 'closed'] as const
export const TICKET_CATEGORIES = ['question', 'bug', 'billing', 'account', 'security', 'feature', 'other'] as const
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Waiting for support',
  waiting: 'Waiting for you',
  resolved: 'Resolved',
  closed: 'Closed'
}
// Same statuses from the support team's side
export const TICKET_STAFF_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Needs reply',
  waiting: 'Waiting on requester',
  resolved: 'Resolved',
  closed: 'Closed'
}
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  question: 'Question',
  bug: 'Something is broken',
  billing: 'Billing',
  account: 'Account and sign-in',
  security: 'Security report',
  feature: 'Feature request',
  other: 'Other'
}
export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent'
}

export const isSupportStaff = (role: string | undefined) => role === 'admin' || role === 'moderator'

// One message as the ticket pages render it
export type TicketThreadMessage = {
  id: string
  author: 'user' | 'staff' | 'system'
  body: string
  internal: boolean
  via: 'web' | 'email'
  createdAt: string
  authorName: string | null
}
