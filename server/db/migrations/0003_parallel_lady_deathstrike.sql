CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"condition" jsonb NOT NULL,
	"destination" text NOT NULL,
	"url" text NOT NULL,
	"cooldown_minutes" integer DEFAULT 10 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" text[] DEFAULT '{ingest}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "read_sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "log_events" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "log_events" ADD COLUMN "span_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "retention_days" integer;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_project_idx" ON "alert_rules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "log_events_trace_idx" ON "log_events" USING btree ("project_id","trace_id") WHERE "log_events"."trace_id" is not null;