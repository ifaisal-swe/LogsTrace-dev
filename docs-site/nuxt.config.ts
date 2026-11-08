export default defineNuxtConfig({
  extends: ['docus'],
  compatibilityDate: '2026-10-01',
  // Docus links /favicon.ico; browsers pick the SVG one
  app: {
    head: {
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },
  site: {
    name: 'LogsTrace Docs',
    url: 'https://docs.logstrace.dev'
  },
  fonts: {
    families: [
      { name: 'Readex Pro', provider: 'google', weights: [300, 400, 500, 600, 700] },
      { name: 'Fragment Mono', provider: 'google', weights: [400] }
    ]
  },
  content: {
    build: {
      markdown: {
        highlight: {
          langs: ['bash', 'json', 'js', 'ts', 'python', 'go', 'php', 'yaml', 'shell', 'ini']
        }
      }
    }
  },
  llms: {
    domain: 'https://docs.logstrace.dev',
    title: 'LogsTrace',
    description: 'Logging for any app, service or script.',
    notes: [
      'Prefer structured events: { "channel": "orders", "event": "order.paid", "orderId": "10293", "amount": 49.9 }. Each key becomes a column; same channel + event + keys = same table.',
      'Never use envelope names (channel, event, level, ts, text, message, data, source, service, time, meta, traceId, spanId, …) as field names. Send null/""/0 instead of omitting a key.',
      'Use cases and naming rules for coding assistants: https://logstrace.dev/llms.txt'
    ]
  }
})
