# API

Base path for project routes: `/api/orgs/:org/projects/:project` (org and project slugs).
Errors: `{ statusCode, statusMessage }`.

## Ingest — `POST /api/ingest`

- Auth: `Authorization: Bearer lgk_…` (key with **send** access).
- Body: one event, an array of events, or `{ "events": [...] }` (1–500). Max 2 MB. 1,200 requests/min per key.
- Optional header `X-LogsTrace-Channel: <name>` = default channel for events without one.
- **Two shapes**, mix freely in one batch:
  - **Structured event (recommended)**: `{ "event": "user.signup", "name": "Sara", "id": "42", "plan": "pro" }`. No `text`/`embed` → every non-envelope key becomes a named column (nested objects → `user.id`, ≤50 fields, values ≤512 chars). Table = `channel` + `event` + key set (exact, order doesn't matter: keys are sorted). Stored text: `user.signup id: 42 name: Sara plan: pro`; whitespace inside a value becomes `_` in text (original value stays in `data`).
  - **Message**: `{ "text": "Order 10293 paid 49.90 USD" }`. Columns are guessed from changing words (`field_N`).
- Envelope keys (never columns): `ts channel level text embed data event traceId spanId` and their aliases below. Other top-level keys are merged into `data` (also for messages; top-level wins on clashes). `data` keys become columns only when there are no top-level fields, so `data` can hold extra JSON (stack traces) next to the columns.
- Field aliases (so other loggers' payloads work unchanged): `message`/`msg`/`body` → `text`, `resource`/`service`/`source` → `channel`, `metadata`/`meta`/`attributes` → `data`, `timestamp`/`time` → `ts`, `trace_id` → `traceId`, `span_id`/`parentId` → `spanId` (trace ids are also read from `data.trace_id`).
- Levels: `debug info warn error fatal`; also `warning`, `critical`, `trace`, … and pino numbers (30, 40, 50, 60).

| Field | Notes |
|---|---|
| `event` | Optional structured event name, ≤100 chars `[A-Za-z0-9_.:-]`, e.g. `order.paid`. First word of the table pattern |
| *any other key* | Structured field → column + `data` |
| `text` | Message, ≤16 KB. Optional; with it the event is a message |
| `embed` | `{ title, description, fields: [{ name, value }] }`, flattened to text. `null` parts (or `embed: null`) count as missing |
| `channel` | Any label (`orders`, `payments`). Tables are per channel |
| `level` | `debug` \| `info` \| `warn` \| `error` (default `info`) |
| `ts` | ISO or Unix s/ms. >7 days off → receive time |
| `data` | Own JSON, ≤32 KB (structured fields count too) |
| `traceId`, `spanId` | Optional, ≤128 chars `[A-Za-z0-9_.:-]`; groups messages of one request/job |

```json
{ "events": [
  { "channel": "payments", "event": "payment.captured", "paymentId": "8812", "orderId": "10293", "amount": 49.90, "currency": "USD" },
  { "channel": "payments", "text": "Payment 8812 for order 10293 captured 49.90 USD" },
  { "channel": "payments", "level": "warn", "text": "Payment 8813 for order 10294 declined 120.00 USD" }
] }
```
Response: `{ "accepted": 3, "status": "ok" }`

## Read API — `GET /api/v1/logs`

- Auth: key with **read** access. 120 requests/min per key. Text is masked unless the key was created with "Show IPs, emails and tokens".
- Query: `level` (comma list), `channel` or `resource` (comma list), `q` or `body` (text contains), `data.<path>=value` or `metadata.<path>=value` (exact, ≤5, dots for nesting), `trace`, `template`, `from`, `to` (ISO), `limit` (≤100), `offset` (≤10,000) or `cursor`, `order` (`asc`/`desc`), `includeTotal=true`.
- Masked keys can't filter on hidden fields (`email`, `ip`, `token`, …) → 403.

```json
{ "status": "ok", "masked": true,
  "data": [ { "id": 191, "timestamp": "…", "level": "warn", "body": "Checkout 7001 failed for user 42", "channel": "checkout",
              "traceId": "tr-abc-1", "spanId": null, "templateId": "…", "metadata": { "plan": "pro", "email": "••••" } } ],
  "pagination": { "limit": 5, "offset": 0, "hasMore": false, "nextCursor": null, "total": 1 } }
```

`GET /api/v1/logs/trace/:traceId` → every message of the trace, oldest first (≤200, `truncated`).

## Session logs list — `GET …/logs`

- Same filters as the read API (`level` list, `trace`, `data.*`, `includeTotal`), session auth, `logs:read`.

## Alerts — `…/alerts` (`projects:manage`)

| Call | Notes |
|---|---|
| `GET …/alerts` | URLs come back shortened (`https://discord.com/api/webhook…`) |
| `POST …/alerts` | `{ name, condition, destination: discord\|slack\|webhook, url, cooldownMinutes (1–1440), enabled }` |
| `PATCH …/alerts/:id` | Any field; URL kept unless sent |
| `DELETE …/alerts/:id` | |
| `POST …/alerts/:id/test` | Sends a sample message (10/min per user) |

Conditions: `{ kind: "level", minLevel: warn|error|fatal, channel?, templateId? }`, `{ kind: "new_table" }`, `{ kind: "text", contains (2–200), level?, channel?, templateId? }` (case-insensitive, on masked text), `{ kind: "volume", threshold, windowMinutes, level?, channel?, templateId? }`. Level, text and new-table alerts fire on ingest; volume alerts are checked every minute. One send per cooldown. Text is always masked.

## Retention and deleting messages

- `PATCH …/projects/:project` accepts `retentionDays` (1–3650 or `null` = forever). An hourly job deletes older messages in batches (audited `retention.purged`).
- `POST …/logs/purge` (`projects:manage`, 10/h): `{ before?, templateId?, channel?, confirm: "<project address>" }` → `{ removed, more }`. Audited.
- `DELETE …/logs/:id` (`projects:manage`, 120/h): one message → `{ removed }`. Audited `logs.deleted`.
- `DELETE …/templates/:id` (`projects:manage`): `{ confirm: "<project address>" }` deletes the table and its messages → `{ removed }`. New matching messages start a fresh table. Audited `template.deleted`.
- `GET …/logs?includeTotal=true` adds `total` (the Logs page asks for it while filters are set and shows "N messages found").

## Query a table — `POST …/templates/:id/query`

- Auth: session cookie, `logs:read`. Same-origin only.
- `field` / `groupBy` / metric `field` = column **position** in the template (must be a `<*>` column).

| Field | Values |
|---|---|
| `from`, `to` | ISO datetime with offset |
| `mode` | `rows` (default) \| `summary` |
| `filters` | ≤20 × `{ field, op, value, value2? }`; ops: `eq neq contains not_contains gt gte lt lte between in empty not_empty` |
| `groupBy` | ≤3 positions (summary) |
| `bucket` | `minute hour day week month` \| `null` |
| `metrics` | ≤6 × `{ fn, field? }`; fn: `count sum avg min max count_distinct` |
| `sort` | `{ by: "ts" \| position \| "m0" \| "g0", dir: "asc"\|"desc" }` |
| `page`, `limit` | rows mode, limit ≤500 |
| `format` | `json` \| `csv` (≤10,000 rows) |

Rows example (declined payments over 100):
```json
{ "filters": [ { "field": 7, "op": "eq", "value": "declined" },
               { "field": 8, "op": "gt", "value": "100" } ] }
```
```json
{ "mode": "rows", "total": 1, "hasMore": false, "masked": false,
  "rows": [ { "id": 51, "ts": "2026-10-06T09:12:00Z", "values": ["8813", "10294", "declined", "120.00"] } ] }
```

Summary example (total captured per day):
```json
{ "mode": "summary", "bucket": "day", "filters": [ { "field": 7, "op": "eq", "value": "captured" } ],
  "metrics": [ { "fn": "count" }, { "fn": "sum", "field": 8 } ] }
```
```json
{ "mode": "summary", "columns": { "groups": ["day"], "metrics": ["Count", "Sum of amount"] },
  "rows": [ { "groups": ["2026-10-06T00:00:00Z"], "metrics": [42, 3810.5] } ], "truncated": false, "masked": false }
```

## Column profile — `POST …/templates/:id/profile`

- Auth: session cookie, `logs:read`. Body: `{ field, from?, to?, filters? }` (same filters as query).
- Returns `total`, `empty`, `distinct`, `top` (10 most common values) and, when ≥80% of values are numbers, `numbers` = `min max avg p50 p95` + 20-bin `histogram`. Masked for viewers.

## Activity — `GET …/activity?range=24h|7d|30d`

- Auth: `logs:read`. Message counts per hour (24h, 7d) or day (30d) and level: `{ bucket, rows: [{ t, level, n }] }`.

## Tables — `GET …/templates`, `PATCH …/templates/:id`

- List adds `description`, `tags`, `pinned`, `hidden`, `firstSeenAt` and `spark` (24 hourly counts, last = current hour).
- PATCH (`templates:manage`), all optional: `name` (`nameSchema`), `description` (≤300, no links), `tags` (≤10, `[letters digits _ -]`, lowercased), `pinned`, `hidden`, `fields`. Audited.

## Saved views — `…/views`

| Call | Permission | Notes |
|---|---|---|
| `GET …/views?kind=table\|logs&template=` | `logs:read` | Shared with the whole project |
| `POST …/views` | `templates:manage` | `{ kind: "table", templateId, name, query }` (query = table query state) or `{ kind: "logs", name, query: { q, channel, level, template } }`. ≤200 per project. Audited |
| `DELETE …/views/:id` | `templates:manage` | Audited |

## Dashboards — `…/dashboards`

| Call | Permission | Notes |
|---|---|---|
| `GET …/dashboards` | `logs:read` | List with `panelCount` |
| `GET …/dashboards/:id` | `logs:read` | `{ id, name, description, panels }` |
| `POST …/dashboards` | `templates:manage` | `{ name, description?, panels? }`. ≤50 per project. Audited |
| `POST …/dashboards/starter` | `templates:manage` | Builds "Project overview" from the project's tables. Also created with every new project |
| `PATCH …/dashboards/:id` | `templates:manage` | Any of `name`, `description`, `panels` (whole list). Audited |
| `DELETE …/dashboards/:id` | `templates:manage` | Audited |

Panel (≤24 per dashboard): `{ id (uuid), title, type, w: 3|4|6|8|12, h: s|m|l, source }`

| `type` | Allowed `source.kind` |
|---|---|
| `timeseries`, `stat` | `volume`, `table` |
| `bars` | `volume` (split ≠ none), `table` (groupBy set) |
| `table` | `table` |
| `logs` | `logs` |

Sources: `volume { split: none|level|channel|table, channel?, level? }`, `table { templateId, metric { fn, field? }, groupBy: position|null, filters }`, `logs { q?, channel?, level?, template? }`. Templates must belong to the project. Panels fetch data through `query`, `volume` and `logs`, so masking applies.

## AI — `…/ai/*` (only when `NUXT_OPENROUTER_API_KEY` is set; else 503)

| Route | Permission | Notes |
|---|---|---|
| `GET /api/ai/status` | signed in | `{ enabled }` |
| `POST …/ai/plan` | `logs:read` | `{ question, previous?, change? }` (refine: the current plan + what to change) → `{ plan, notes }`. Nothing is queried. Per model call: 20/10 min and 100/day per user, 300/day per org. Audited |
| `POST …/ai/run` | `logs:read` | `{ plan }` → `{ results: [{ id, title, op, columns, rows, total, note, tableId }], masked }`. 10/min per user, one at a time (429), 15 s total (408) |
| `POST …/ai/dashboard` | `templates:manage` | `{ request, existing? }` (titles already on the dashboard) → `{ name, description, panels, notes }`. Not saved. Same AI limits. Audited |

| `POST …/ai/name-tables` | `templates:manage` | Names empty tables and `field_N` columns (≤25 tables) → `{ tables, columns }`. Same AI limits. Audited |

## MCP — `POST /api/mcp`

Streamable HTTP (MCP 2026-07-28, stateless). `Authorization: Bearer lgk_…` with **read** access; project and masking come from the key. 60/min per key. Off with `NUXT_MCP_ENABLED=false` (404).

| Tool | Input |
|---|---|
| `list_tables` | `{ includeHidden? }` → tables with `columns: [{ column, name, type }]` |
| `search_messages` | `{ text?, levels?, channel?, table?, range, limit≤100 }` |
| `find_value` | `{ value, range, limit≤100 }` |
| `query_table` | `{ table, mode: rows\|summary, filters, groupBy, bucket, metrics, range, limit≤100 }` |
| `run_plan` | A plan (below) |

Results: `{ masked, note, results: [step results] }`.

Plan: `{ title, explanation, range: 15m…90d|all, steps[≤6] }`. Steps (`id` s1–s6):
- `messages` `{ text?, levels?, channel?, table?, limit≤200 }` → `time, level, channel, text`
- `find_value` `{ value, limit≤200 }` → `time, table, text`
- `table_rows` `{ table, filters, sort: { by: 'ts'|column, dir }, limit≤200 }` → `time, c<column>`
- `table_summary` `{ table, filters, groupBy≤3, bucket?, metrics≤4 { fn, column? }, sort?: { by: g0|m0…, dir }, limit≤100 }` → `g0…, m0…`
- Filter `{ column, op, value, value2?, from?: { step, key } }`; `from` takes up to 100 values of an earlier step's output and needs `op: 'in'`.

## Volume — `POST …/volume`

- Auth: `logs:read`. Body: `{ from?, to?, bucket: minute|hour|day|week|month|null, split, channel?, level? }`.
- Returns `{ rows: [{ t, k, n }], names, capped }`; at most 20 keys (busiest first), `names` maps table ids to names.
- Limits: 300 requests/min per user; `minute` buckets cover ≤2 days, `hour` ≤120 days (400 otherwise).

## Platform stats — `GET /api/public/stats`

- Public, no auth. `{ logs, at }` = total stored messages rounded down to 2 significant digits on the server, one cache entry for 1 hour (query strings ignored).

## Organizations and projects

- `POST /api/orgs` and `POST …/projects` take only `{ name }`. The address (slug) is made from the name (`checkout-api`, then `-2`, `-3`…; random for names without Latin letters). Renaming keeps the address.

## Search a value — `GET …/search?value=10293`

- Auth: session cookie, `logs:read`. Optional `from`, `to`, `template` (uuid), `limit` (≤500, default 200).
- Whole-word match, punctuation trimmed (`#10293`, `[10293]` match). Scans latest 10k matches.

```json
{ "value": "10293", "masked": false, "capped": false,
  "tables": [ { "templateId": "…", "name": "Payment captured", "channel": "payments", "pattern": "Payment <*> for order <*> …", "count": 3, "last": "…" } ],
  "rows": [ { "id": 50, "ts": "…", "channel": "payments", "level": "info", "templateId": "…",
              "text": "Payment 8812 for order 10293 captured 49.90 USD",
              "matched": ["order_id"], "fields": [ { "name": "order_id", "type": "number", "value": "10293" } ] } ] }
```

Viewers (`masked: true`) get masked text; filters and search run on the masked text.

## Support tickets

Session cookie. Requester routes need a (verified, if required) account; staff routes need platform role `admin` or `moderator`.

| Route | Body / query | Notes |
|---|---|---|
| `GET /api/tickets` | — | Own tickets with `unread` |
| `POST /api/tickets` | `{ subject, category, priority?: low\|normal\|high, body, projectId? }` | 5/hour/user; project must be one of yours |
| `GET /api/tickets/:id` | — | Own ticket only (404 otherwise); internal notes left out |
| `POST /api/tickets/:id/messages` | `{ body }` | Reopens a resolved ticket; 409 when closed |
| `PATCH /api/tickets/:id` | `{ status: resolved\|open }` | Requester resolves / reopens |
| `GET /api/support/tickets` | `?status=open\|waiting\|resolved\|closed\|active\|all&assigned=me\|none\|any&q=` | Returns `{ tickets, counts }`; `q` matches subject, requester, `#number` |
| `GET /api/support/tickets/:id` | — | Includes internal notes, requester, project, other tickets |
| `POST /api/support/tickets/:id/messages` | `{ body, internal?, status? }` | Public reply sets `waiting` and assigns the replier if unassigned |
| `PATCH /api/support/tickets/:id` | `{ status?, priority?, assigneeId? }` | Assignee must be staff |
| `GET /api/support/staff` | — | Staff list for assigning |
| `POST /api/inbound/resend` | Resend `email.received` webhook | Svix-signed; no cookies. Always 200 once verified (ignored reasons are logged), 502 if the body can't be fetched so Resend retries |
