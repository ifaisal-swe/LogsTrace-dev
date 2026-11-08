# Roadmap

Update this file when an item ships (move it to "Done" with the date).

| # | Item | Start here | Done when |
|---|---|---|---|
| 15 | Optional automatic AI naming of new tables | `nameTables()` in `server/utils/ai.ts`, a per-project setting | Off by default; one call per batch of new tables; same rules as the "Name with AI" button |
| 16 | Cap read keys per project and rate-limit key creation | `…/keys/index.post.ts` | Document the limits in API.md |
| 14 | AI: test with a real OpenRouter key | `server/utils/ai.ts` prompts | 20 sample questions/dashboards on a demo project produce valid plans; tune prompts |
| 5 | Automated test suite | new `tests/`; targets: ingest, query, search, auth, masking | API tests run in CI against a test DB; cover role masking (viewer vs admin), filter ops, CSV guard, lockout, CSRF 403 |
| 6 | CSP smoke test on prod build | `nuxt.config.ts` (`security`) | `npm run build && preview` → no CSP violations in console on main pages; header present |
| 7 | Browser-test masked live path | `server/plugins/live.ts`, `app/composables/useLive.ts` | Real viewer account sees masked live rows; role change moves room within 30 s |
| 20 | Drop the old Postgres `log_events` table | new migration (keep `log_event_ids`) | Production has run on ClickHouse for ~2 weeks without issues |
| 21 | ClickHouse operations | Volume backups or `BACKUP … TO S3`, uptime check on `/ping` | Restore tested once; alert when ingest returns 503 |
| 22 | Retention by ClickHouse TTL | `server/db/clickhouse/`, `jobs.ts` | Per-project days stored per row or a TTL job; hourly `DELETE` job removed |
| 11 | OG/social preview image (PNG) | `public/`, `nuxt.config.ts` head | 1200×630 PNG + `og:*` / `twitter:*` meta; PNG favicon fallback |
| 13 | Ticket attachments | `server/api/inbound/resend.post.ts` (Resend gives attachment ids), `ticket_messages` | Files stored outside the DB, size/type limits, scanned or served with `Content-Disposition: attachment` |
| 12 | Optional CAPTCHA/Turnstile on register | `server/api/auth/register.post.ts`, `app/pages/register.vue` | Only if spam appears; server-side verify; CSP updated |

## Done

- 2026-11-08 — Open source (AGPL-3.0, CLA): self-hosting guide, contributing guide, issue/PR templates, security policy, CI typecheck
- 2026-10-08 — "Text contains" alerts (Discord, Slack, webhook), on masked text
- 2026-10-07 — `llms.txt` for AI assistants (`public/llms.txt` on logstrace.dev: ingest format, naming rules, use cases) + docs "Use cases" page and llms notes
- 2026-10-07 — Structured events at ingest (`{ event, ...fields }`): one table per event, columns named after the keys; messages still work
- 2026-10-07 — Delete one message, purge by channel, delete a table with its messages; result count on filtered Logs
- 2026-10-07 — Readable mixed-direction log text (direction from the table pattern, isolated values) and Discord-style Markdown (bold, code, hidden, underline)
- 2026-10-07 — Logs moved to ClickHouse (#17–19): every log read/write in `logStore.ts`, Postgres keeps the rest and the id sequence; old vs new compared on 120 endpoint checks
- 2026-10-07 — ClickHouse step 1 (#10): connection, `log_events` table, ingest and deletes mirrored, `npm run ch:backfill`; reads still on Postgres
- 2026-10-07 — MCP server for AI assistants (`/api/mcp`, read keys); AI guards (redaction, hidden characters, size cap), fallback model, plan refinement, "Name with AI" for tables (#3); table metadata masked for viewers
- 2026-10-07 — AI (#4): "Ask" on Search turns a question into a read-only step plan that runs with the user's access; "Build with AI" / "Add with AI" for dashboards (Mastra + OpenRouter, DeepSeek v4.1 Flash)
- 2026-10-07 — Email through Resend with branded templates (#1, replaces Authentica #2); two-step sign-in (authenticator app + recovery codes), new-device and security-change emails
- 2026-10-07 — Landing page redesign (use cases, features, FAQ, docs links); one-step path to logs (Home, switcher, Ctrl+K)
- 2026-10-07 — Support tickets: requester pages, staff inbox (assign, priority, internal notes), moderator role, email notifications, reply by email (Resend inbound), ticket events on the platform webhook, auto-close
- 2026-10-06 — Charts: time-series chart in table summaries, messages-over-time on the overview, sparklines on Tables
- 2026-10-06 — Column profile (top values, empty %, number stats, histogram, click to filter)
- 2026-10-06 — Organising tables: tags, description, pin, hide, sort; table filter on Logs
- 2026-10-06 — Saved views for tables and logs
- 2026-10-06 — Dashboards: time series, bars, stat, table and logs panels; shared range + auto-refresh; starter overview per project
- 2026-10-06 — Automatic org/project addresses from the name
- 2026-10-06 — "Serving N+ logs" on the landing page (hourly)
- 2026-10-06 — Ingest compatibility (arrays, message/metadata/resource, level aliases, fatal), trace ids
- 2026-10-06 — Read API with scoped keys; data-field and trace filters on Logs
- 2026-10-06 — Alerts to Discord, Slack and webhooks (level, new table, volume)
- 2026-10-06 — Retention per project (#9) and deleting messages by date/table
- 2026-10-06 — Public docs site (`docs-site/`, docs.logstrace.dev): guides, integrations, API reference, self-hosting
