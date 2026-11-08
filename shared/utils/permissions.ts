export const ORG_ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type OrgRole = typeof ORG_ROLES[number]

export const PERMISSIONS = [
  'org:update',
  'org:delete',
  'members:read',
  'members:manage',
  'projects:create',
  'projects:manage',
  'keys:manage',
  'logs:read',
  'logs:read_sensitive',
  'templates:manage',
  'audit:read'
] as const
export type Permission = typeof PERMISSIONS[number]

const viewer: Permission[] = ['members:read', 'logs:read']
const member: Permission[] = [...viewer, 'templates:manage']
const admin: Permission[] = [
  ...member, 'org:update', 'members:manage', 'projects:create', 'projects:manage',
  'keys:manage', 'logs:read_sensitive', 'audit:read'
]
const owner: Permission[] = [...admin, 'org:delete']

// Named aliases keep the exported annotations simple
type PermissionSet = ReadonlySet<Permission>
type RoleLabel = { label: string, description: string }

export const ROLE_PERMISSIONS: Record<OrgRole, PermissionSet> = {
  owner: new Set(owner),
  admin: new Set(admin),
  member: new Set(member),
  viewer: new Set(viewer)
}

export const ROLE_RANK: Record<OrgRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 }

export const ROLE_LABELS = {
  owner: { label: 'Owner', description: 'Full control, including deleting the organization.' },
  admin: { label: 'Admin', description: 'Manages members, projects and API keys, and can see IPs and email addresses.' },
  member: { label: 'Member', description: 'Reads logs and names templates.' },
  viewer: { label: 'Viewer', description: 'Reads logs. Sensitive fields stay hidden.' }
} satisfies Record<OrgRole, RoleLabel>


export function roleCan(role: OrgRole | null | undefined, permission: Permission) {
  return !!role && ROLE_PERMISSIONS[role].has(permission)
}

// A member can only assign or remove roles below their own (owners can manage everyone)
export function canManageRole(actor: OrgRole, target: OrgRole) {
  if (actor === 'owner') return true
  return ROLE_RANK[actor] > ROLE_RANK[target]
}
