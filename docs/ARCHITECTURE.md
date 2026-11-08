# Architecture

## Components

| Component | Tech | Where |
|---|---|---|
| UI | Nuxt 4 pages + Nuxt UI 4 | `app/` |
| API | Nitro routes (h3) | `server/api/` |
| Middleware | CSRF/size checks, session loading | `server/middleware/02.csrf.ts`, `03.session.ts` |
| DB | PostgreSQL 18 via Drizzle for everything except log messages | `server/db/schema.ts`, `server/db/migrations/` (run on startup by `server/plugins/migrate.ts`) |
| Log store | ClickHouse 26 (`log_events`, monthly partitions, `ORDER BY (project_id, ts, id)`) | `server/utils/logStore.ts` (every log read/write), `server/utils/chSql.ts` (typed params), `server/db/clickhouse/*.sql` (applied on startup) |
| Live | Socket.IO on Nitro experimental websocket | `server/plugins/live.ts`, `server/utils/live.ts`, `app/composables/useLive.ts` |
| Shared | Permissions, zod schemas, `safeRedirect` | `shared/utils/` |
| Security headers | nuxt-security | `nuxt.config.ts` |

## Data model (main tables)

- `users`, `sessions`, `auth_tokens`, `audit_log`, `rate_limits`
- `organizations` → `memberships` (role) / `invitations`
- `tickets` (number, requester, status open/waiting/resolved/closed, priority, assignee, reply_key) → `ticket_messages` (author user/staff/system, internal, via web/email)
- `projects` → `api_keys` (sha256 hash only), `log_templates` (tokens, fields, description, tags, pinned, hidden), `saved_views` (kind, query JSON)
- ClickHouse `log_events` (id, project_id, template_id, ts, channel, level, text, data/embed as JSON strings, trace/span ids). ids come from the Postgres sequence `log_event_ids`. The old Postgres `log_events` table is a frozen backup, dropped once the move is confirmed

## Ingest flow

1. `POST /api/ingest` (`server/api/ingest.post.ts`): API key → rate limit (1,200/min/key) → zod validate (≤500 events, 2 MB).
2. `matchTemplate()` (`server/utils/drain.ts`): tokenise, compare with templates of same channel + token count, merge at ≥50% match. Differing positions become `<*>` → column `field_N`. Structured events (no `text`/`embed`) go through `structuredText()` (`server/utils/structuredEvent.ts`) first: text `event key: value …`, value positions are columns named after the keys, and keys must match exactly.
3. `insertLogs()` takes ids from `log_event_ids` (one call per batch) and inserts into ClickHouse (async insert, waits until readable). If ClickHouse fails, ingest answers 503 so senders retry. `flushTemplates()` persists template changes.
4. `publishLive()` → Postgres `NOTIFY lg_live` (chunked under 8 KB).
5. Every app instance `LISTEN`s, fans out to rooms `p:<projectId>:full` and `p:<projectId>:masked`.

## API keys

- Scopes: `ingest` (send) and/or `read`; `read_sensitive` lets a read key see unmasked text (only if its creator can).
- Read API: `server/api/v1/logs/*` → `server/utils/logQuery.ts` (shared with the Logs page).

## Alerts and jobs

- `alert_rules` table; `server/utils/alerts.ts` (conditions, webhook payloads for Discord/Slack/JSON, SSRF checks), `server/utils/alertRules.ts`.
- Level/new-table rules run after each ingest (async, never block it). Volume rules + retention run in `server/plugins/jobs.ts` under Postgres advisory locks (one instance at a time). Sends are claimed atomically via `last_fired_at`, so several instances never double-send.

## Support tickets

- Logic in `server/utils/tickets.ts` (create, replies, staff changes, emails); routes `server/api/tickets/*` (requester) and `server/api/support/*` (staff = `admin` or `moderator`, `requireSupportStaff`).
- Every change calls `audit()` → platform webhook (Discord) with ticket number, status and a short preview; internal notes are only audited.
- Emails: `server/utils/emailTemplates.ts` (`ticket*`), sent with `Reply-To: support+<replyKey>@…` and a shared `References` header so clients thread them.
- Inbound: Resend `email.received` → `POST /api/inbound/resend` → Svix check → fetch body (`GET /emails/receiving/:id`) → `server/utils/inboundEmail.ts` (quote stripping, commands) → same functions as the web.
- Hourly job closes resolved tickets after `NUXT_SUPPORT_AUTO_CLOSE_DAYS`.
- Pages: `/app/support`, `/app/support/:id`, `/app/admin/tickets`, `/app/admin/tickets/:id`.

## Live socket

- Auth: session cookie + same-origin check on connect.
- Room chosen by role (`logs:read_sensitive` → full, else masked).
- Sessions and roles re-checked every 30 s; socket moves room or is dropped.
- UI: Overview, Logs (pause, "N new"), Tables, table view.

## Query engine

- `POST …/templates/:id/query` → `server/utils/analyze.ts`.
- Column values computed **in ClickHouse at query time** from `text` (`chTokens` = same tokenising as drain). Column N = `tk[N+1]`. Queries live in `server/utils/logStore.ts`.
- Viewers query `chMasked(text)` (same rules as `maskText`, RE2) instead of `text`, so filters/search can't reveal masked data.
- Modes: `rows` (sort, paging, CSV ≤10k) and `summary` (group by ≤3 columns + time bucket, ≤6 metrics, ≤500 groups).
- `…/profile` reuses the same source (`templateSource`) for per-column stats (`quantileExactInclusive` for p50/p95).
- UI: `app/pages/o/[org]/p/[project]/templates/[id].vue`; state in URL `?q=` (JSON). Saved views store that same JSON.

## Charts

- Plain SVG, no chart library: `app/components/TimeChart.vue` (stacked bars for count/sum, lines for avg/min/max; crosshair tooltip, arrow keys), `MiniBars.vue` (sparklines, histograms).
- `app/utils/chartData.ts`: summary rows → series (top 5 groups, rest folded into "Other"), gap-filled time buckets.
- Colours: `--chart-*` tokens in `app/assets/css/main.css`, CVD-checked for light and dark. Summary table stays under the chart.

## Dashboards

- `dashboards` table: name, description, `panels` JSON (validated by `panelSchema` in `server/utils/dashboards.ts`).
- Panels render in `app/components/DashboardPanel.vue`; editor with live preview in `PanelEditor.vue`; pages `…/dashboards/index.vue`, `[id].vue`.
- One time range + auto-refresh per dashboard (URL `?range=&refresh=`); bucket picked from the range (`autoBucket`).
- Data comes from existing endpoints (`templates/:id/query`, `logs`) plus `volume.post.ts` for message counts.
- `server/utils/starterDashboard.ts`: "Project overview" (key counts, volume by level/channel/table, averages of number columns of the busiest tables, latest errors). Made with each new project, or on first visit for older ones.

## Navigation

- `/app` = Home: all projects across orgs (`GET /api/me/projects`, with 24 h counts) and direct Logs/Tables/Dashboards buttons.
- Sidebar: project switcher, Ctrl/Cmd+K jump search (`UDashboardSearch`), project pages first. `useMyProjects()` / `useLastProject()` in `app/composables/useMyProjects.ts`.

## Search

- `GET …/search?value=` → `server/api/orgs/[org]/projects/[project]/search.get.ts`.
- `ilike` on the visible text narrows candidates (latest 10k), then whole-word token match (punctuation trimmed).
- Returns per-table counts and which named columns held the value.
- UI: `…/search.vue`, sidebar "Search".

## AI

- `server/utils/ai.ts`: Mastra agents (planner, dashboard) on OpenRouter; `projectCatalog()` = masked table shapes + samples sent to the model; output → zod → retry once with the error.
- `server/utils/aiPlan.ts`: plan language (`messages`, `find_value`, `table_rows`, `table_summary`, chained `in` filters via `from: { step, key }`) and `runPlan()` (read-only transaction, caller's masking).
- Shared engines: `server/utils/tableRun.ts` (table rows/summary, also used by `query.post.ts`), `server/utils/valueSearch.ts` (also `search.get.ts`), `queryLogs()`.
- Guards: Mastra input processors on every agent (hidden characters, `MASK_RULES` redaction, 30k-token cap) and a fallback model.
- `nameTables()`: names empty tables / `field_N` columns under a row lock.
- MCP: `server/api/mcp.ts` (read key → `req.auth`) + `server/utils/mcp.ts` (`MCPServer`, tools `list_tables`, `search_messages`, `find_value`, `query_table`, `run_plan`; data tools build a plan for `runPlan`).
- Routes `…/ai/plan` (also refine), `…/ai/run`, `…/ai/dashboard`, `…/ai/name-tables`, `/api/ai/status`. UI: `AiAsk.vue` (Search → Ask), `AiDashboardModal.vue` (dashboards), `app/utils/aiPlan.ts` (plan → plain sentences).

## File map

| Area | Files |
|---|---|
| Ingest + grouping | `server/api/ingest.post.ts`, `server/utils/drain.ts`, `server/utils/apiKeys.ts` |
| Analysis | `server/utils/analyze.ts`, `…/templates/[id]/query.post.ts`, `…/profile.post.ts`, `…/activity.get.ts`, `app/utils/tableQuery.ts`, `app/utils/chartData.ts` |
| Organising | `…/templates/[id].patch.ts` (tags, pin, hide), `…/views/*`, `app/pages/o/[org]/p/[project]/templates/index.vue` |
| Search | `…/search.get.ts`, `server/utils/valueSearch.ts`, `app/pages/o/[org]/p/[project]/search.vue` |
| AI | `server/utils/ai.ts`, `server/utils/aiPlan.ts`, `server/utils/mcp.ts`, `server/api/mcp.ts`, `…/ai/*`, `app/components/AiAsk.vue`, `AiDashboardModal.vue` |
| Masking | `server/utils/mask.ts` |
| Access | `server/utils/access.ts` (`requireOrgAccess`, `requireProjectAccess`), `shared/utils/permissions.ts` |
| Auth | `server/api/auth/*`, `server/utils/session.ts`, `crypto.ts`, `authTokens.ts`, `emailOtp.ts` |
| Limits + audit | `server/utils/rateLimit.ts`, `server/utils/audit.ts` |
| Mail | `server/utils/mailer.ts` (console only) |
| Client auth gate | `app/middleware/auth.ts`, `guest.ts`, `admin.ts` |
