# Security

## Controls (OWASP Top 10 2021)

| OWASP | Controls | Where |
|---|---|---|
| A01 Broken Access Control | `requireOrgAccess` / `requireProjectAccess` on every org/project route; roles owner/admin/member/viewer; non-members get 404; role-rank checks; server-side masking for viewers (also live + filters + search) | `server/utils/access.ts`, `shared/utils/permissions.ts`, `server/utils/mask.ts` |
| A02 Cryptographic Failures | scrypt passwords; session tokens and API keys stored as sha256; `__Host-` Secure cookie in prod; HSTS 2y preload | `server/utils/crypto.ts`, `session.ts`, `apiKeys.ts` |
| A03 Injection | Drizzle parameterised SQL; zod on all inputs; filter ops/positions whitelisted; LIKE escaping; CSV formula guard; CSP nonce + `strict-dynamic` | `server/utils/analyze.ts`, `…/query.post.ts`, `nuxt.config.ts` |
| A04 Insecure Design | Postgres rate limits (incl. 300/min/user on `volume`, minute buckets ≤2 days, hour ≤120 days); public stats cached as one entry for 1 h; lockout 5 fails/15 min; OTP limits; registration modes; body caps (2 MB ingest, 256 KB other) | `rateLimit.ts`, `login.post.ts`, `emailOtp.ts`, `02.csrf.ts` |
| A05 Security Misconfiguration | nuxt-security headers: CSP, `frame-ancestors none`, X-Frame-Options DENY, COOP/CORP same-origin, Permissions-Policy, hidePoweredBy; DB/app bound to 127.0.0.1 | `nuxt.config.ts`, `docker-compose.yml` |
| A06 Vulnerable Components | Pinned Nuxt 4.5.2, TS 5.9; lockfile | `package.json` |
| A07 Auth Failures | DB sessions (revocable, per device); timing-equalised login; email codes stored hashed, 10 min, 5 tries/15 min; optional TOTP two-step sign-in (AES-GCM encrypted secret, replay-proof step, 5 tries/15 min, one-time hashed recovery codes, password + code to turn off); emails on password/2FA changes and new devices; sessions re-checked on live socket every 30 s | `server/api/auth/*`, `server/plugins/live.ts` |
| A08 Integrity Failures | Same-origin CSRF check (Origin = `NUXT_APP_URL`); Content-Length required | `server/middleware/02.csrf.ts`, `server/utils/origin.ts` |
| A09 Logging Failures | Audit log for sign-in, password, session, member, key events | `server/utils/audit.ts` |
| A10 SSRF | Resend (fixed URL). Alert webhooks: https on 443 only, no IP literals, every DNS answer must be public (checked on save and before each send), Discord/Slack host allow-lists, no redirects, 5 s timeout; webhook URLs never returned in full | `server/utils/emailOtp.ts`, `server/utils/alerts.ts` |

Also:
- Anti-phishing: names reject links, domains, emails, hidden/bidi chars (`isSafeDisplayText`); `safeRedirect()` blocks `//host`, `/\host`.
- `public/.well-known/security.txt`, `public/robots.txt` (disallows `/app`, `/o/`, `/api/`, `/invite/`).
- Two-step sign-in: 5 tries/15 min and 20/day per account; 3 wrong codes in an hour cancel open challenges and email the owner ("someone knows your password"). Turning it on or making new recovery codes signs out other devices. Recovery codes are HMAC'd with `NUXT_SECRET_KEY`. Platform admins can reset a user's 2FA (audited).
- "New device" alerts compare the browser string only (best-effort; a copied user agent avoids the email). Turning alerts off needs the password.
- Platform webhook (`NUXT_PLATFORM_WEBHOOK_URL`) is Discord-only (same URL checks as alerts), never includes IPs, masks emails unless `NUXT_PLATFORM_WEBHOOK_SHOW_EMAILS=true`, and escapes user-chosen names.
- Webhooks leave the platform, so alert payloads always use masked text. DNS can still change between the check and the request (rebinding); acceptable for now, pin the address if stricter isolation is needed.
- Read API keys see masked text unless created with "Show IPs, emails and tokens" by someone with `logs:read_sensitive`; if that person is demoted or removed, their keys fall back to masked. Masked readers can't filter on hidden data fields, and data filters match plain values only (not objects).
- Unknown API keys aren't cached and are limited to 30 misses/min per IP; read-key revocations reach every instance within 10 s (send keys 60 s).
- Alert text is escaped for Slack/Discord (no mentions, links or code-block breakouts); private, NAT64, 6to4 and documentation ranges are refused.
- Saved views and dashboard panels store filter values as typed and are readable by everyone with `logs:read` (viewers too). Don't save views that filter on secrets; the save dialog says so.
- Support tickets: requesters see only their own (404 otherwise); internal notes never leave staff routes, emails or the webhook (also with `ticket.*`). Public message previews (400 chars) do go to the operator Discord. Message bodies are plain text (no `v-html`), direction-override characters stripped. Limits: 5 new tickets/hour, 60 replies/hour per user.
- Inbound email (`/api/inbound/resend`): Svix HMAC signature, ±5 min timestamp, deduped by Message-ID; sender must be the requester or a staff account. Requester replies (backed by the secret reply key) need SPF or DKIM pass and no DMARC fail; staff actions, new tickets and follow-ups need DMARC pass (From domain proven). Unknown `/commands` drop the email so a typo can't publish a note. Auto-replies ignored; 30 emails/hour per account, counted after authentication. Email-sourced actions are audited with `via: email` (no session/2FA behind them). Unknown senders get no answer (no backscatter).
- `moderator` platform role can read and answer every ticket but can't manage users.
- Platform admin rights need a verified email (the bootstrap email gets the role at sign-up, before verification).
- Client IP for rate limits and audit (`clientIp`): the last `X-Forwarded-For` hop, or the header in `NUXT_TRUSTED_IP_HEADER`; never the client-controlled first hop.
- AI (`server/utils/ai.ts`, `aiPlan.ts`): the model writes plans/panel config only (no SQL, no code) and never sees results. Plans are re-validated on run (client can edit them), tables must belong to the project, run with the caller's masking in a read-only transaction (15 s for the whole run, one run per person at a time, ≤6 steps, row caps). Model-chosen filter values/text must pass `isSafeDisplayText`. AI errors are logged without the request body (Mastra logger silenced). What goes to OpenRouter: the question, table patterns, column names and 3 sample values per column (≤30 columns, ≤40 KB), all masked. Model text shown to people drops anything link-like (log data can carry prompt injection). Dashboard drafts are saved through the normal dashboard routes.
- AI guards: before any model call, hidden/bidi characters are removed, IPs/emails/tokens/`password=` values redacted (`MASK_RULES`), prompts over 30k tokens refused. Max 4 plan runs at once platform-wide, one per person or key.
- MCP (`/api/mcp`): read API keys only (send keys 403, cookies ignored); the key fixes project and masking, tool input can't change them. POST only, 60 requests/min per key, one run at a time per key. Exempt from the Origin check only when no Origin is sent (non-browser clients); a browser Origin must be ours. Tools are read-only, results capped (100 rows, 2 KB cells, ~1 MB) with hidden characters stripped; unexpected errors are hidden. Log text still reaches the client's AI provider, and log lines can try to steer that assistant; MCP results say the text is data. Revoked keys stop within 10 s. Turn off with `NUXT_MCP_ENABLED=false`.
- Table patterns, names and descriptions are masked for roles without `logs:read_sensitive` (patterns keep fixed words).
- `xssValidator` is off on purpose (logs contain `<>`); rely on Vue escaping + CSP. Never use `v-html` on log data.

## Production checklist

- [ ] HTTPS reverse proxy (Caddy/nginx/Cloudflare) in front of `127.0.0.1:3000`.
- [ ] `NUXT_APP_URL` = exact public origin (`https://…`). Wrong value = all writes 403 and live socket fails.
- [ ] `NUXT_REQUIRE_EMAIL_VERIFICATION=true`.
- [ ] `NUXT_RESEND_API_KEY` set and the sender domain verified in Resend (SPF/DKIM in DNS). Test one real sign-up code and password reset.
- [ ] MCP: keep `NUXT_MCP_ENABLED=true` only if people may connect AI assistants with read keys.
- [ ] AI: decide whether prompts may go to OpenRouter (`NUXT_OPENROUTER_API_KEY`); set a spend limit on the OpenRouter key.
- [ ] `NUXT_SECRET_KEY` set to a long random value (encrypts 2FA secrets). Keep it stable; changing it breaks existing 2FA.
- [ ] ClickHouse: HTTPS URL, a user limited to the LogsTrace database (not `default`), built-in web UIs (`/play`, `/dashboard`, `/clickstack`) not served publicly. It holds all unmasked log text; masking happens at query time (`chMasked`) and in JS, same rules as before.
- [ ] `NUXT_PUBLIC_REGISTRATION` chosen (`invite` or `closed` for private installs).
- [ ] `NUXT_BOOTSTRAP_ADMIN_EMAIL` set to your email, then register and verify right after the first deploy (admin rights need a verified email).
- [ ] Client IP: one Caddy/nginx proxy works by default (last `X-Forwarded-For` hop). Behind Cloudflare set `NUXT_TRUSTED_IP_HEADER=cf-connecting-ip` and allow only Cloudflare IPs to the origin.
- [ ] `NUXT_OWNER_EMAILS` set to the owner account(s) for the owner dashboard (verified email required).
- [ ] Strong `POSTGRES_PASSWORD`; secrets only in env / secret store, never in git.
- [ ] `.env` and `.dev-accounts.md` not committed (both git-ignored).
- [ ] Check response headers on the prod build (CSP present, no `X-Powered-By`).
- [ ] Support by email (optional): receiving domain in Resend, `NUXT_SUPPORT_INBOUND_ADDRESS`, webhook for `email.received` to `https://<app>/api/inbound/resend`, its secret in `NUXT_RESEND_WEBHOOK_SECRET`.
- [ ] Update `security.txt` contact/expiry.
