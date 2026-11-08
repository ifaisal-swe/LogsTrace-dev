const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const IPV6 = /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g
// Bearer tokens and common secret-key shapes (sk_live_..., lgk_..., ghp_...)
const BEARER = /\bBearer(\s+)[\w.~+/-]{16,}/g
const SECRET = /\b(?:sk|pk|rk|lgk|ghp|gho|xox[abp])_[\w-]{12,}\b/g
// Same patterns for redacting text before it goes to an AI provider
export const MASK_RULES = [
  { name: 'bearer', pattern: BEARER, replacement: 'Bearer ••••' },
  { name: 'secret', pattern: SECRET, replacement: '••••' },
  { name: 'email', pattern: EMAIL, replacement: '••••@••••' },
  { name: 'ipv4', pattern: IPV4, replacement: '•.•.•.•' },
  { name: 'ipv6', pattern: IPV6, replacement: '••••:••••' },
  { name: 'credential', pattern: /\b(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)\S+/gi, replacement: '$1$2••••' }
]
const SENSITIVE_KEY_NAMES = 'ip|ipv4|ipv6|email|phone|token|access_token|refresh_token|password|secret|authorization|api_?key'
export const SENSITIVE_KEYS = new RegExp(`^(${SENSITIVE_KEY_NAMES})$`, 'i')
// Structured events are stored as `key: value` words; hide the value after a sensitive key (`phone: 0551…`, `user.email: …`).
// `<*>` is a table pattern placeholder, not a value.
const SENSITIVE_PAIR = new RegExp(`(^|\\s)((?:[\\w-]+\\.)*(?:${SENSITIVE_KEY_NAMES}):)(\\s+)(?!<\\*>)\\S+`, 'gi')

export function maskText(text: string) {
  // Replacements never add or remove spaces, so table columns keep their positions
  return text
    .replace(BEARER, 'Bearer$1••••')
    .replace(SECRET, '••••')
    .replace(EMAIL, '••••@••••')
    .replace(IPV4, '•.•.•.•')
    .replace(IPV6, '••••:••••')
    .replace(SENSITIVE_PAIR, '$1$2$3••••')
}

export function maskData(value: unknown): unknown {
  if (typeof value === 'string') return maskText(value)
  if (Array.isArray(value)) return value.map(maskData)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? '••••' : maskData(v)]))
  }
  return value
}

// Patterns keep words that never changed (a fixed IP or address), so table metadata follows masking too
export function maskTemplateText<T extends { pattern: string, name: string | null, description?: string | null, tokens?: string[] }>(t: T): T {
  return {
    ...t,
    pattern: maskText(t.pattern),
    name: t.name && maskText(t.name),
    ...(t.description !== undefined ? { description: t.description && maskText(t.description) } : {}),
    ...(t.tokens ? { tokens: t.tokens.map(maskText) } : {})
  }
}
