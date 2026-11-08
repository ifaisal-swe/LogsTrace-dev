export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui', 'nuxt-security'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'LogsTrace',
      meta: [
        { name: 'description', content: 'Send logs from any system, then filter, summarise and trace any value across them. LogsTrace groups repeated messages into tables automatically.' },
        { name: 'theme-color', content: '#15211f' }
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },

  fonts: {
    families: [
      // Arabic subset so Arabic log text renders in the UI font too
      { name: 'Readex Pro', provider: 'google', weights: [300, 400, 500, 600, 700], subsets: ['latin', 'arabic'] },
      { name: 'Fragment Mono', provider: 'google', weights: [400] }
    ]
  },

  colorMode: { preference: 'light' },

  hooks: {
    // Live dashboard updates: Socket.IO runs on Nitro's WebSocket support (option missing from Nuxt's nitro typings)
    'nitro:config'(config) {
      Object.assign(config.experimental ??= {}, { websocket: true })
    }
  },

  runtimeConfig: {
    databaseUrl: '',
    appUrl: 'http://localhost:3000',
    // Lets the first account become a platform admin when no admin exists yet
    bootstrapAdminEmail: '',
    // Header with the real client IP set by your proxy (e.g. cf-connecting-ip); default: last X-Forwarded-For hop
    trustedIpHeader: '',
    // Comma list; these verified accounts (only) can open the owner dashboard at /app/admin
    ownerEmails: '',
    // true = accounts must enter the emailed code before using organizations
    requireEmailVerification: false,
    // Operator feed of sign-ups, new orgs/projects etc. to one Discord webhook (optional)
    platformWebhookUrl: '',
    // Comma list of audit actions; empty = sign-ups, orgs, projects, invites, keys, alerts, purges
    platformWebhookEvents: '',
    // false = emails shown as a•••@example.com in Discord
    platformWebhookShowEmails: false,
    // Transactional email through Resend (verification codes, resets, invites, security notices)
    resendApiKey: '',
    mailFrom: 'LogsTrace <no-reply@logstrace.dev>',
    mailReplyTo: '',
    // Support tickets by email: replies go to support+<key>@ this address (a Resend receiving domain)
    supportInboundAddress: '',
    // Signing secret (whsec_…) of the Resend webhook for email.received, posted to /api/inbound/resend
    resendWebhookSecret: '',
    // Resolved tickets close after this many quiet days
    supportAutoCloseDays: 7,
    // Encrypts two-step sign-in secrets at rest; required in production once anyone turns 2FA on
    secretKey: '',
    // AI features (dashboard builder, question → plan) through OpenRouter; empty key = AI off
    openrouterApiKey: '',
    aiModel: 'deepseek/deepseek-v4.1-flash',
    // Used when the main model fails or is unavailable; empty = no fallback
    aiFallbackModel: 'deepseek/deepseek-v4-flash',
    // MCP endpoint (/api/mcp) for AI clients, using read API keys; false = off
    mcpEnabled: true,
    // ClickHouse stores all logs (required); Postgres keeps everything else
    clickhouseUrl: '',
    clickhouseUser: 'default',
    clickhousePassword: '',
    clickhouseDatabase: 'logstrace',
    public: {
      appName: 'LogsTrace',
      // open | invite (only people with a pending invitation) | closed
      registration: 'open'
    }
  },

  security: {
    nonce: true,
    // Logs legitimately contain <, > and script-like text, so the XSS body validator would reject real data
    xssValidator: false,
    // Postgres-backed limits in server/utils/rateLimit.ts work across instances; this one is in-memory
    rateLimiter: false,
    // Ingest accepts 2 MB; other API bodies are capped at 256 KB in server/middleware/02.csrf.ts
    requestSizeLimiter: { maxRequestSizeInBytes: 2_200_000, maxUploadFileRequestInBytes: 2_200_000, throwError: true },
    corsHandler: false,
    hidePoweredBy: true,
    headers: {
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'script-src': ["'self'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
        'script-src-attr': ["'none'"],
        // Vue style bindings set inline styles
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': false
      },
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      strictTransportSecurity: { maxAge: 63072000, includeSubdomains: true, preload: true },
      crossOriginOpenerPolicy: 'same-origin',
      crossOriginResourcePolicy: 'same-origin',
      crossOriginEmbedderPolicy: false,
      permissionsPolicy: {
        'camera': [], 'microphone': [], 'geolocation': [], 'payment': [], 'usb': [], 'display-capture': [], 'fullscreen': ['self']
      }
    }
  },

  $development: {
    // Vite's dev client needs eval and inline scripts; production gets the strict policy above
    security: {
      nonce: false,
      headers: { contentSecurityPolicy: false, strictTransportSecurity: false, crossOriginOpenerPolicy: false }
    }
  },

  typescript: { strict: true }
})
