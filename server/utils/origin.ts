// In production only the configured public origin (NUXT_APP_URL) may make cookie-authenticated
// requests; in development the request's own host is accepted so localhost ports work.
export function isAllowedOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin) return false
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (!import.meta.dev) return parsed.origin === new URL(useRuntimeConfig().appUrl).origin
  return !!host && parsed.host === host
}
