import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsDatabase, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

export { schema }
export { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'

// The pool or a transaction (AI plans run inside a read-only one)
export type DbOrTx = PgDatabase<PostgresJsQueryResultHKT, typeof schema>

let db: PostgresJsDatabase<typeof schema> | undefined
let client: ReturnType<typeof postgres> | undefined

export function useDb() {
  if (!db) {
    const url = useRuntimeConfig().databaseUrl
    if (!url) throw new Error('NUXT_DATABASE_URL is not set')
    client = postgres(url, { max: 10 })
    db = drizzle(client, { schema })
  }
  return db
}

export function useDbClient() {
  useDb()
  return client!
}
