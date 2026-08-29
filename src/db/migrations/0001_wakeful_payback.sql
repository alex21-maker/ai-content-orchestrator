CREATE TYPE "public"."meeting_status" AS ENUM('DRAFT', 'TRANSCRIBED', 'ANALYZED', 'PUBLISHED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."agent_type" ADD VALUE 'MEETING_ANALYSIS';--> statement-breakpoint
CREATE TABLE "meeting_slack_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"mode" "connector_mode" DEFAULT 'MOCK' NOT NULL,
	"succeeded" boolean NOT NULL,
	"response_summary" jsonb,
	"error_message" text,
	"delivered_by_id" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"agent_run_id" text,
	"language_breakdown" jsonb NOT NULL,
	"key_statements_ko" jsonb NOT NULL,
	"key_statements_zh" jsonb NOT NULL,
	"decisions" jsonb NOT NULL,
	"action_items" jsonb NOT NULL,
	"meeting_risks" jsonb NOT NULL,
	"confidence" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_summaries_meeting_id_unique" UNIQUE("meeting_id")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"languages" text[] DEFAULT '{"ko","zh"}' NOT NULL,
	"participants" text[] DEFAULT '{}' NOT NULL,
	"audio_asset_url" text,
	"transcript_text" text,
	"status" "meeting_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_slack_deliveries" ADD CONSTRAINT "meeting_slack_deliveries_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_slack_deliveries" ADD CONSTRAINT "meeting_slack_deliveries_delivered_by_id_users_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_slack_deliveries_meeting_idx" ON "meeting_slack_deliveries" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_summaries_meeting_idx" ON "meeting_summaries" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_org_idx" ON "meetings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");