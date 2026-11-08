import { randomBytes } from 'node:crypto'

// URL address from a name: "Checkout API" -> checkout-api, then -2, -3… if taken.
// Names with no Latin letters or digits (e.g. Arabic) get a short random address.
export async function uniqueSlug(name: string, fallback: string, taken: (slug: string) => Promise<boolean>) {
  const base = slugify(name).slice(0, 34).replace(/-+$/, '') || `${fallback}-${randomBytes(3).toString('hex')}`
  const padded = base.length < 2 ? `${base}-${fallback}` : base
  for (let i = 1; i <= 50; i++) {
    const slug = i === 1 ? padded : `${padded}-${i}`
    if (!(await taken(slug))) return slug
  }
  return `${padded}-${randomBytes(3).toString('hex')}`
}

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string, cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

// Two creates with the same name can pick the same slug at once; the loser retries with a random suffix
export async function withSlugRetry<T>(slug: string, insert: (slug: string) => Promise<T>) {
  try {
    return await insert(slug)
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    return insert(`${slug.slice(0, 33)}-${randomBytes(3).toString('hex')}`)
  }
}
