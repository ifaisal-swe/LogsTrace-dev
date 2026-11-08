-- All log messages. ids come from the Postgres sequence log_event_ids, so paging cursors and live tail keep working.
-- ReplacingMergeTree collapses duplicate rows (same sort key), so the backfill can be rerun safely.
CREATE TABLE IF NOT EXISTS log_events
(
  id UInt64,
  project_id UUID,
  api_key_id Nullable(UUID),
  template_id Nullable(UUID),
  ts DateTime64(3, 'UTC'),
  received_at DateTime64(3, 'UTC') DEFAULT now64(3),
  channel LowCardinality(String),
  level LowCardinality(String),
  text String CODEC(ZSTD(3)),
  embed String CODEC(ZSTD(3)),
  data String CODEC(ZSTD(3)),
  trace_id String,
  span_id String,
  INDEX text_ngram text TYPE ngrambf_v1(3, 65536, 3, 0) GRANULARITY 4,
  INDEX template_bf template_id TYPE bloom_filter(0.01) GRANULARITY 4,
  INDEX trace_bf trace_id TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (project_id, ts, id)
