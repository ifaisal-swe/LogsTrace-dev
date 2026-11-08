export default defineNitroPlugin(async () => {
  if (import.meta.prerender) return
  try {
    await migrateClickHouse()
    console.info('[clickhouse] schema up to date')
  } catch (err) {
    console.error('[clickhouse] setup failed. Logs are stored in ClickHouse: run npm run ch:up locally, and set NUXT_CLICKHOUSE_URL, user and password.', err)
  }
})
