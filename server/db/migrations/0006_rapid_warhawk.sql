CREATE SEQUENCE "public"."log_event_ids" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
-- Continue after every id the old table ever handed out (ClickHouse holds copies with those ids)
SELECT setval('"public"."log_event_ids"', GREATEST((SELECT last_value FROM log_events_id_seq), 1));
