export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const
export type LogLevel = typeof LOG_LEVELS[number]

export const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 }

// Names other loggers use (syslog, pino, winston, Python logging…)
const ALIASES: Record<string, LogLevel> = {
  trace: 'debug', verbose: 'debug', silly: 'debug',
  information: 'info', notice: 'info', log: 'info',
  warning: 'warn',
  err: 'error', exception: 'error',
  critical: 'fatal', crit: 'fatal', alert: 'fatal', emergency: 'fatal', emerg: 'fatal', panic: 'fatal'
}

export function normalizeLevel(value: unknown): LogLevel | null {
  if (typeof value === 'number') {
    // pino: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal
    return value >= 60 ? 'fatal' : value >= 50 ? 'error' : value >= 40 ? 'warn' : value >= 30 ? 'info' : 'debug'
  }
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  return (LOG_LEVELS as readonly string[]).includes(v) ? v as LogLevel : ALIASES[v] ?? null
}

export const LEVEL_LABELS: Record<LogLevel, string> = { debug: 'Debug', info: 'Info', warn: 'Warning', error: 'Error', fatal: 'Fatal' }
export const LEVEL_BADGE: Record<LogLevel, 'neutral' | 'info' | 'warning' | 'error'> = { debug: 'neutral', info: 'info', warn: 'warning', error: 'error', fatal: 'error' }
