CREATE TYPE "public"."agent_run_status" AS ENUM('COMPLETED', 'NEEDS_REVISION', 'BLOCKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('ORCHESTRATOR', 'RESEARCH', 'STRATEGY', 'COPYWRITING', 'CREATIVE', 'QUALITY_REVIEW', 'PUBLISHING', 'OPERATIONS', 'ANALYTICS');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('INSTAGRAM', 'THREADS', 'BLOGGER');--> statement-breakpoint
CREATE TYPE "public"."connector_mode" AS ENUM('MOCK', 'PRODUCTION');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('IDEA', 'RESEARCHING', 'DRAFTING', 'REVIEWING', 'REVISION_REQUIRED', 'READY_FOR_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'MONITORING', 'ANALYZED', 'BLOCKED', 'FAILED', 'CANCELED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."publication_job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('BLOCKER', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER');--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_run_id" text NOT NULL,
	"artifacts" jsonb,
	"sources" jsonb,
	"assumptions" jsonb,
	"risks" jsonb,
	"recommendations" jsonb,
	"next_action" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"content_item_id" text,
	"agent_type" "agent_type" NOT NULL,
	"task_id" text NOT NULL,
	"status" "agent_run_status" NOT NULL,
	"summary" text NOT NULL,
	"confidence" double precision,
	"prompt_version_id" text,
	"triggered_by_id" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"approved_by_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"invalidated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_variant_id" text,
	"kind" text NOT NULL,
	"storage_url" text NOT NULL,
	"prompt" text,
	"seed" text,
	"model_name" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"product_info" text,
	"target_audience" text,
	"tone_of_voice" text,
	"forbidden_words" text[] DEFAULT '{}' NOT NULL,
	"required_phrases" text[] DEFAULT '{}' NOT NULL,
	"logo_url" text,
	"colors" jsonb,
	"fonts" jsonb,
	"competitors" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"brand_profile_id" text,
	"name" text NOT NULL,
	"brief" text NOT NULL,
	"goal" text,
	"target_persona" text,
	"funnel_stage" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"cta_text" text,
	"alt_text" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"title" text NOT NULL,
	"core_idea" text,
	"status" "content_status" DEFAULT 'IDEA' NOT NULL,
	"revision_round" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_version_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_status_events" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"from_status" "content_status",
	"to_status" "content_status" NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"impressions" integer,
	"reach" integer,
	"views" integer,
	"likes" integer,
	"comments" integer,
	"saves" integer,
	"shares" integer,
	"clicks" integer,
	"conversions" integer,
	"is_estimated" boolean DEFAULT true NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"agent_type" "agent_type" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_template_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"approval_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"scheduled_for" timestamp,
	"status" "publication_job_status" DEFAULT 'QUEUED' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publication_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "publication_results" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_job_id" text NOT NULL,
	"social_connection_id" text,
	"mode" "connector_mode" DEFAULT 'MOCK' NOT NULL,
	"external_post_id" text,
	"external_url" text,
	"request_summary" jsonb,
	"response_summary" jsonb,
	"succeeded" boolean NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"category" text NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"description" text NOT NULL,
	"suggestion" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"mode" "connector_mode" DEFAULT 'MOCK' NOT NULL,
	"account_label" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"content_item_id" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp,
	"accessed_at" timestamp DEFAULT now() NOT NULL,
	"key_claim" text,
	"confidence" double precision,
	"is_stale" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_triggered_by_id_users_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_channel_variant_id_channel_variants_id_fk" FOREIGN KEY ("channel_variant_id") REFERENCES "public"."channel_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_profile_id_brand_profiles_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_variants" ADD CONSTRAINT "channel_variants_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_threads" ADD CONSTRAINT "comment_threads_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_status_events" ADD CONSTRAINT "content_status_events_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_template_id_prompt_templates_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_results" ADD CONSTRAINT "publication_results_publication_job_id_publication_jobs_id_fk" FOREIGN KEY ("publication_job_id") REFERENCES "public"."publication_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_results" ADD CONSTRAINT "publication_results_social_connection_id_social_connections_id_fk" FOREIGN KEY ("social_connection_id") REFERENCES "public"."social_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_run_idx" ON "agent_messages" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "agent_runs_campaign_idx" ON "agent_runs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "agent_runs_item_idx" ON "agent_runs" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "approvals_item_idx" ON "approvals" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "assets_variant_idx" ON "assets" USING btree ("channel_variant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "brand_profiles_org_idx" ON "brand_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "campaigns_org_idx" ON "campaigns" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "channel_variants_item_idx" ON "channel_variants" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "channel_variants_channel_idx" ON "channel_variants" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "comment_threads_item_idx" ON "comment_threads" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "content_items_campaign_idx" ON "content_items" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "content_items_status_idx" ON "content_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_status_events_item_idx" ON "content_status_events" USING btree ("content_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_org_unique" ON "memberships" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "memberships_org_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "metric_snapshots_item_idx" ON "metric_snapshots" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "prompt_templates_org_idx" ON "prompt_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_template_version_unique" ON "prompt_versions" USING btree ("prompt_template_id","version");--> statement-breakpoint
CREATE INDEX "publication_jobs_item_idx" ON "publication_jobs" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "publication_jobs_status_idx" ON "publication_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "publication_results_job_idx" ON "publication_results" USING btree ("publication_job_id");--> statement-breakpoint
CREATE INDEX "review_findings_item_idx" ON "review_findings" USING btree ("content_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connections_org_channel_unique" ON "social_connections" USING btree ("organization_id","channel");--> statement-breakpoint
CREATE INDEX "social_connections_org_idx" ON "social_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sources_item_idx" ON "sources" USING btree ("content_item_id");