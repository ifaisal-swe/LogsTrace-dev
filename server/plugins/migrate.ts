import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

export default defineNitroPlugin(async () => {
  try {
    await migrate(useDb(), { migrationsFolder: resolve(process.cwd(), 'server/db/migrations') })
    console.info('[db] migrations up to date')
  } catch (err) {
    console.error('[db] migration failed. Is Postgres running (npm run db:up) and NUXT_DATABASE_URL set?', err)
  }

  // Expired sessions, tokens and rate-limit rows are cleaned hourly
  const cleanup = async () => {
    const client = useDbClient()
    await client`delete from sessions where expires_at < now()`
    await client`delete from auth_tokens where expires_at < now() - interval '1 day'`
    await client`delete from rate_limits where reset_at < now()`
    await client`delete from invitations where accepted_at is null and expires_at < now() - interval '7 days'`
  }
  setInterval(() => cleanup().catch(err => console.error('[db] cleanup failed', err)), 3600_000).unref()
})
