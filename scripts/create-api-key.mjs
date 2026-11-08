// Creates a project API key from the command line: npm run key:create -- <org-slug> <project-slug> "Key name"
import postgres from 'postgres'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'

if (!process.env.NUXT_DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const [orgSlug, projectSlug, rawName] = process.argv.slice(2)
const name = (rawName ?? '').trim()
if (!orgSlug || !projectSlug || name.length < 2 || name.length > 60) {
  console.error('Usage: npm run key:create -- <org-slug> <project-slug> "Key name (2-60 chars)"')
  process.exit(1)
}

const sql = postgres(process.env.NUXT_DATABASE_URL)
try {
  const [project] = await sql`
    select p.id, p.org_id from projects p join organizations o on o.id = p.org_id
    where o.slug = ${orgSlug.toLowerCase()} and p.slug = ${projectSlug.toLowerCase()}`
  if (!project) {
    console.error(`No project ${orgSlug}/${projectSlug}.`)
    process.exitCode = 1
  } else {
    // Same format as the UI: only the sha256 is stored, the key is shown once
    const key = `lgk_${randomBytes(32).toString('base64url')}`
    const hash = createHash('sha256').update(key).digest('hex')
    const [row] = await sql`
      insert into api_keys (project_id, name, prefix, key_hash)
      values (${project.id}, ${name}, ${key.slice(0, 12)}, ${hash}) returning id`
    await sql`
      insert into audit_log (org_id, action, meta)
      values (${project.org_id}, 'apikey.created', ${sql.json({ projectId: project.id, keyId: row.id, name, via: 'cli' })})`
    console.log(`Created "${name}" for ${orgSlug}/${projectSlug}. Copy it now, it won't be shown again:\n\n${key}\n`)
  }
} finally {
  await sql.end()
}
