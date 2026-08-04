// AI Content Orchestrator — Phase 1 data model (Drizzle ORM)
// See docs/PRD.md section 5 for design rationale. This mirrors the Prisma
// schema originally drafted for this project; we moved to Drizzle because
// Prisma's CLI requires downloading native engine binaries from
// binaries.prisma.sh, which this sandbox's egress proxy blocks. Drizzle is
// pure TypeScript + the `pg` driver, so it needs no such download — and the
// project's own PRD explicitly allows "PostgreSQL + Prisma or Drizzle".

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const cuid = () => text("id").primaryKey().$defaultFn(() => createId());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"]);
export const channelEnum = pgEnum("channel", ["INSTAGRAM", "THREADS", "BLOGGER"]);
export const connectorModeEnum = pgEnum("connector_mode", ["MOCK", "PRODUCTION"]);
export const contentStatusEnum = pgEnum("content_status", [
  "IDEA",
  "RESEARCHING",
  "DRAFTING",
  "REVIEWING",
  "REVISION_REQUIRED",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "MONITORING",
  "ANALYZED",
  "BLOCKED",
  "FAILED",
  "CANCELED",
  "ARCHIVED",
]);
export const agentTypeEnum = pgEnum("agent_type", [
  "ORCHESTRATOR",
  "RESEARCH",
  "STRATEGY",
  "COPYWRITING",
  "CREATIVE",
  "QUALITY_REVIEW",
  "PUBLISHING",
  "OPERATIONS",
  "ANALYTICS",
]);
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "COMPLETED",
  "NEEDS_REVISION",
  "BLOCKED",
  "FAILED",
]);
export const riskLevelEnum = pgEnum("risk_level", ["BLOCKER", "HIGH", "MEDIUM", "LOW"]);
export const publicationJobStatusEnum = pgEnum("publication_job_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "RETRYING",
  "CANCELED",
]);

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: cuid(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: cuid(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: cuid(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_user_org_unique").on(t.userId, t.organizationId),
    index("memberships_org_idx").on(t.organizationId),
  ]
);

export const brandProfiles = pgTable(
  "brand_profiles",
  {
    id: cuid(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    productInfo: text("product_info"),
    targetAudience: text("target_audience"),
    toneOfVoice: text("tone_of_voice"),
    forbiddenWords: text("forbidden_words").array().notNull().default([]),
    requiredPhrases: text("required_phrases").array().notNull().default([]),
    logoUrl: text("logo_url"),
    colors: jsonb("colors"),
    fonts: jsonb("fonts"),
    competitors: text("competitors").array().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("brand_profiles_org_idx").on(t.organizationId)]
);

// ---------------------------------------------------------------------------
// Channel connectors
// ---------------------------------------------------------------------------

export const socialConnections = pgTable(
  "social_connections",
  {
    id: cuid(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    mode: connectorModeEnum("mode").notNull().default("MOCK"),
    accountLabel: text("account_label").notNull(),
    status: text("status").notNull().default("connected"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("social_connections_org_channel_unique").on(t.organizationId, t.channel),
    index("social_connections_org_idx").on(t.organizationId),
  ]
);

// ---------------------------------------------------------------------------
// Campaigns & content
// ---------------------------------------------------------------------------

export const campaigns = pgTable(
  "campaigns",
  {
    id: cuid(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    brandProfileId: text("brand_profile_id").references(() => brandProfiles.id),
    name: text("name").notNull(),
    brief: text("brief").notNull(),
    goal: text("goal"),
    targetPersona: text("target_persona"),
    funnelStage: text("funnel_stage"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("campaigns_org_idx").on(t.organizationId)]
);

export const contentItems = pgTable(
  "content_items",
  {
    id: cuid(),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    coreIdea: text("core_idea"),
    status: contentStatusEnum("status").notNull().default("IDEA"),
    revisionRound: integer("revision_round").notNull().default(0),
    version: integer("version").notNull().default(1),
    parentVersionId: text("parent_version_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("content_items_campaign_idx").on(t.campaignId), index("content_items_status_idx").on(t.status)]
);

export const contentStatusEvents = pgTable(
  "content_status_events",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    fromStatus: contentStatusEnum("from_status"),
    toStatus: contentStatusEnum("to_status").notNull(),
    actorType: text("actor_type").notNull(), // "user" | "agent" | "system"
    actorId: text("actor_id"),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("content_status_events_item_idx").on(t.contentItemId)]
);

export const channelVariants = pgTable(
  "channel_variants",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    hashtags: text("hashtags").array().notNull().default([]),
    ctaText: text("cta_text"),
    altText: text("alt_text"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(), // "agent:copywriting" | "agent:creative" | userId
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("channel_variants_item_idx").on(t.contentItemId), index("channel_variants_channel_idx").on(t.channel)]
);

export const assets = pgTable(
  "assets",
  {
    id: cuid(),
    channelVariantId: text("channel_variant_id").references(() => channelVariants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "image" | "video" | "thumbnail"
    storageUrl: text("storage_url").notNull(),
    prompt: text("prompt"),
    seed: text("seed"),
    modelName: text("model_name"),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("assets_variant_idx").on(t.channelVariantId)]
);

export const sources = pgTable(
  "sources",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at"),
    accessedAt: timestamp("accessed_at").notNull().defaultNow(),
    keyClaim: text("key_claim"),
    confidence: doublePrecision("confidence"),
    isStale: boolean("is_stale").notNull().default(false),
  },
  (t) => [index("sources_item_idx").on(t.contentItemId)]
);

// ---------------------------------------------------------------------------
// Agent orchestration (mock in Phase 1)
// ---------------------------------------------------------------------------

export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: cuid(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    agentType: agentTypeEnum("agent_type").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("prompt_templates_org_idx").on(t.organizationId)]
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: cuid(),
    promptTemplateId: text("prompt_template_id").notNull().references(() => promptTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prompt_versions_template_version_unique").on(t.promptTemplateId, t.version)]
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: cuid(),
    campaignId: text("campaign_id").references(() => campaigns.id),
    contentItemId: text("content_item_id").references(() => contentItems.id),
    agentType: agentTypeEnum("agent_type").notNull(),
    taskId: text("task_id").notNull(),
    status: agentRunStatusEnum("status").notNull(),
    summary: text("summary").notNull(),
    confidence: doublePrecision("confidence"),
    promptVersionId: text("prompt_version_id").references(() => promptVersions.id),
    triggeredById: text("triggered_by_id").references(() => users.id),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [index("agent_runs_campaign_idx").on(t.campaignId), index("agent_runs_item_idx").on(t.contentItemId)]
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: cuid(),
    agentRunId: text("agent_run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
    artifacts: jsonb("artifacts"),
    sources: jsonb("sources"),
    assumptions: jsonb("assumptions"),
    risks: jsonb("risks"),
    recommendations: jsonb("recommendations"),
    nextAction: text("next_action"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("agent_messages_run_idx").on(t.agentRunId)]
);

export const reviewFindings = pgTable(
  "review_findings",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    description: text("description").notNull(),
    suggestion: text("suggestion"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("review_findings_item_idx").on(t.contentItemId)]
);

// ---------------------------------------------------------------------------
// Approval & publication
// ---------------------------------------------------------------------------

export const approvals = pgTable(
  "approvals",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    approvedById: text("approved_by_id").notNull().references(() => users.id),
    contentHash: text("content_hash").notNull(),
    decision: text("decision").notNull(), // "approved" | "rejected" | "revision_requested"
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    invalidatedAt: timestamp("invalidated_at"),
  },
  (t) => [index("approvals_item_idx").on(t.contentItemId)]
);

export const publicationJobs = pgTable(
  "publication_jobs",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    approvalId: text("approval_id").notNull().references(() => approvals.id),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    scheduledFor: timestamp("scheduled_for"),
    status: publicationJobStatusEnum("status").notNull().default("QUEUED"),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("publication_jobs_item_idx").on(t.contentItemId), index("publication_jobs_status_idx").on(t.status)]
);

export const publicationResults = pgTable(
  "publication_results",
  {
    id: cuid(),
    publicationJobId: text("publication_job_id").notNull().references(() => publicationJobs.id, { onDelete: "cascade" }),
    socialConnectionId: text("social_connection_id").references(() => socialConnections.id),
    mode: connectorModeEnum("mode").notNull().default("MOCK"),
    externalPostId: text("external_post_id"),
    externalUrl: text("external_url"),
    requestSummary: jsonb("request_summary"),
    responseSummary: jsonb("response_summary"),
    succeeded: boolean("succeeded").notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("publication_results_job_idx").on(t.publicationJobId)]
);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    impressions: integer("impressions"),
    reach: integer("reach"),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    saves: integer("saves"),
    shares: integer("shares"),
    clicks: integer("clicks"),
    conversions: integer("conversions"),
    isEstimated: boolean("is_estimated").notNull().default(true),
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
  },
  (t) => [index("metric_snapshots_item_idx").on(t.contentItemId)]
);

export const commentThreads = pgTable(
  "comment_threads",
  {
    id: cuid(),
    contentItemId: text("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("comment_threads_item_idx").on(t.contentItemId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: cuid(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_org_idx").on(t.organizationId)]
);

// Append-only audit log. Application code must never expose an update/delete
// path for this table (see docs/PRD.md section 8). actorId is deliberately
// NOT a foreign key — see the long-form comment in docs/PRD.md; agent/system
// actors have no `users` row, and an audit insert must never fail because a
// referenced user was later removed.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: cuid(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(), // "user" | "agent" | "system"
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_org_idx").on(t.organizationId), index("audit_logs_target_idx").on(t.targetType, t.targetId)]
);

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  approvals: many(approvals),
  notifications: many(notifications),
  comments: many(commentThreads),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  brandProfiles: many(brandProfiles),
  socialConnections: many(socialConnections),
  campaigns: many(campaigns),
  promptTemplates: many(promptTemplates),
  notifications: many(notifications),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  organization: one(organizations, { fields: [memberships.organizationId], references: [organizations.id] }),
}));

export const brandProfilesRelations = relations(brandProfiles, ({ one, many }) => ({
  organization: one(organizations, { fields: [brandProfiles.organizationId], references: [organizations.id] }),
  campaigns: many(campaigns),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  organization: one(organizations, { fields: [campaigns.organizationId], references: [organizations.id] }),
  brandProfile: one(brandProfiles, { fields: [campaigns.brandProfileId], references: [brandProfiles.id] }),
  contentItems: many(contentItems),
  agentRuns: many(agentRuns),
}));

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [contentItems.campaignId], references: [campaigns.id] }),
  channelVariants: many(channelVariants),
  sources: many(sources),
  agentRuns: many(agentRuns),
  reviewFindings: many(reviewFindings),
  approvals: many(approvals),
  publicationJobs: many(publicationJobs),
  metricSnapshots: many(metricSnapshots),
  commentThreads: many(commentThreads),
  statusHistory: many(contentStatusEvents),
}));

export const channelVariantsRelations = relations(channelVariants, ({ one, many }) => ({
  contentItem: one(contentItems, { fields: [channelVariants.contentItemId], references: [contentItems.id] }),
  assets: many(assets),
}));

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [agentRuns.campaignId], references: [campaigns.id] }),
  contentItem: one(contentItems, { fields: [agentRuns.contentItemId], references: [contentItems.id] }),
  promptVersion: one(promptVersions, { fields: [agentRuns.promptVersionId], references: [promptVersions.id] }),
  triggeredBy: one(users, { fields: [agentRuns.triggeredById], references: [users.id] }),
  messages: many(agentMessages),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  agentRun: one(agentRuns, { fields: [agentMessages.agentRunId], references: [agentRuns.id] }),
}));

export const approvalsRelations = relations(approvals, ({ one, many }) => ({
  contentItem: one(contentItems, { fields: [approvals.contentItemId], references: [contentItems.id] }),
  approvedBy: one(users, { fields: [approvals.approvedById], references: [users.id] }),
  publicationJobs: many(publicationJobs),
}));

export const publicationJobsRelations = relations(publicationJobs, ({ one, many }) => ({
  contentItem: one(contentItems, { fields: [publicationJobs.contentItemId], references: [contentItems.id] }),
  approval: one(approvals, { fields: [publicationJobs.approvalId], references: [approvals.id] }),
  results: many(publicationResults),
}));

export const publicationResultsRelations = relations(publicationResults, ({ one }) => ({
  publicationJob: one(publicationJobs, { fields: [publicationResults.publicationJobId], references: [publicationJobs.id] }),
  socialConnection: one(socialConnections, { fields: [publicationResults.socialConnectionId], references: [socialConnections.id] }),
}));

export const promptTemplatesRelations = relations(promptTemplates, ({ one, many }) => ({
  organization: one(organizations, { fields: [promptTemplates.organizationId], references: [organizations.id] }),
  versions: many(promptVersions),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one, many }) => ({
  promptTemplate: one(promptTemplates, { fields: [promptVersions.promptTemplateId], references: [promptTemplates.id] }),
  agentRuns: many(agentRuns),
}));
