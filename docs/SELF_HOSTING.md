# Self-hosting LogsTrace

Run your own instance on any Linux server with Docker. For local development see the [README](../README.md#quick-start-local).

## Requirements

| | Minimum | Notes |
|---|---|---|
| Server | 2 vCPU, 4 GB RAM, 40 GB SSD | ClickHouse likes RAM; grow disk with log volume |
| Software | Docker + Docker Compose v2, Git | |
| Domain | e.g. `logs.example.com` | HTTPS is required in production (secure cookies, HSTS) |
| Email | [Resend](https://resend.com) account | Verification codes, resets, invites. Production refuses to start sending without it |

## 1. Clone

```bash
git clone https://github.com/ifaisal-swe/LogsTrace.git
cd LogsTrace
cp .env.example .env
```

## 2. Configure `.env`

Generate secrets with `openssl rand -hex 32`. Set at least:

```env
POSTGRES_PASSWORD=<random>
CLICKHOUSE_PASSWORD=<random>
NUXT_APP_URL=https://logs.example.com
NUXT_SECRET_KEY=<random, never change it after users enable 2FA>
NUXT_RESEND_API_KEY=re_...
NUXT_MAIL_FROM=LogsTrace <no-reply@example.com>
NUXT_BOOTSTRAP_ADMIN_EMAIL=you@example.com
NUXT_PUBLIC_REGISTRATION=invite     # or open / closed
```

- In Docker, `NUXT_DATABASE_URL` and `NUXT_CLICKHOUSE_URL` are set by `docker-compose.yml` (the localhost values in `.env` are ignored). To use an external ClickHouse, edit `NUXT_CLICKHOUSE_URL` in `docker-compose.yml`.
- Full list: [README → Environment variables](../README.md#environment-variables).
- Never commit `.env`.

## 3. Start

```bash
docker compose --profile app up -d --build
docker compose logs -f app      # migrations run on startup
```

Postgres, ClickHouse and the app bind to `127.0.0.1` only. Nothing is exposed until you add a reverse proxy.

## 4. HTTPS reverse proxy

Caddy (automatic certificates), `/etc/caddy/Caddyfile`:

```
logs.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

nginx works too; forward `Upgrade`/`Connection` headers for the live socket (`/socket.io/`).

Client IPs (rate limits, audit log): by default the app trusts only the **last** `X-Forwarded-For` hop, which is what one Caddy/nginx proxy adds. Behind Cloudflare, set `NUXT_TRUSTED_IP_HEADER=cf-connecting-ip` and firewall the server so only Cloudflare IPs reach it; otherwise anyone can fake that header.

## 5. First login

1. Right after the first start, open `https://logs.example.com` and register with `NUXT_BOOTSTRAP_ADMIN_EMAIL`, then verify the email. Admin rights only work once the email is verified.
2. Create an organisation and a project, then an API key on the project's **API keys** page.
3. Send a test event:

```bash
curl -X POST https://logs.example.com/api/ingest \
  -H "Authorization: Bearer lgk_..." -H "Content-Type: application/json" \
  -d '{"event":"deploy.finished","service":"api","version":"1.2.0"}'
```

## Update

```bash
git pull
docker compose --profile app up -d --build
```

Check [docs/ROADMAP.md](ROADMAP.md) and the release notes for breaking changes before updating.

## Back up

```bash
# Postgres (accounts, projects, settings)
docker compose exec -T db pg_dump -U logstrace logstrace | gzip > logstrace-$(date +%F).sql.gz
```

- ClickHouse holds the log events; back up the `chdata` volume or use `BACKUP DATABASE logstrace TO Disk(...)`.
- Keep `.env` (especially `NUXT_SECRET_KEY`) with your backups, stored safely.

## Production checklist

See [docs/SECURITY.md](SECURITY.md#production-checklist). In short: HTTPS only, strong unique passwords, `NUXT_SECRET_KEY` set, registration set to `invite` or `closed` for private installs, firewall allows only 80/443 (and SSH).

## Troubleshooting

| Problem | Fix |
|---|---|
| `set POSTGRES_PASSWORD in .env` | `POSTGRES_PASSWORD` is empty |
| App can't reach ClickHouse | `CLICKHOUSE_PASSWORD` set? `docker compose logs clickhouse` |
| Emails not sent | `NUXT_RESEND_API_KEY` set and the `NUXT_MAIL_FROM` domain verified in Resend |
| Sign-in fails behind the proxy | `NUXT_APP_URL` must match the public URL exactly (scheme + host) |
| Live view doesn't update | Proxy must forward WebSocket upgrades |
