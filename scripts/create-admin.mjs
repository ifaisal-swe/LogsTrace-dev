// Promotes an existing account to platform admin: npm run admin:create -- you@example.com
import postgres from 'postgres'
import { readFileSync, existsSync } from 'node:fs'

if (!process.env.NUXT_DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const email = process.argv[2]?.toLowerCase()
if (!email) {
  console.error('Usage: npm run admin:create -- you@example.com')
  process.exit(1)
}

const sql = postgres(process.env.NUXT_DATABASE_URL)
const rows = await sql`update users set platform_role = 'admin', updated_at = now() where lower(email) = ${email} returning email`
console.log(rows.length ? `${rows[0].email} is now a platform admin.` : `No account with ${email}. Register first, then run this again.`)
await sql.end()
