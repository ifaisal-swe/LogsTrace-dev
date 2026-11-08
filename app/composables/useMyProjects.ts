export type MyProject = { projectId: string, orgSlug: string, orgName: string, role: OrgRole, projectSlug: string, projectName: string, last24h: number, lastEvent: string | null }

// All projects across the user's organizations; shared by the home page, sidebar switcher and search
export function useMyProjects() {
  return useFetch<MyProject[]>('/api/me/projects', { key: 'me:projects', default: () => [] })
}

// "org/project" of the last project opened, so sign-in can land straight on its logs
export function useLastProject() {
  return useCookie<string | null>('lt_last', { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/', default: () => null })
}

export const projectPath = (p: { orgSlug: string, projectSlug: string }) => `/o/${p.orgSlug}/p/${p.projectSlug}`
