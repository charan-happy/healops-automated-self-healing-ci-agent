import { pgTable, check, serial, timestamp, varchar, jsonb, text, index, unique, uuid, boolean, foreignKey, uniqueIndex, bigint, vector, integer, json, real, type AnyPgColumn, date, numeric, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const dbAuditLogs = pgTable("db_audit_logs", {
	id: serial().primaryKey().notNull(),
	eventTimestamp: timestamp("event_timestamp", { withTimezone: true, mode: 'string' }).defaultNow(),
	tableName: varchar("table_name", { length: 100 }).notNull(),
	operationType: varchar("operation_type", { length: 10 }).notNull(),
	dbUser: varchar("db_user", { length: 100 }),
	dbName: varchar("db_name", { length: 100 }),
	oldValue: jsonb("old_value"),
	newValue: jsonb("new_value"),
	triggeredBy: text("triggered_by").default(CURRENT_USER),
}, (table) => [
	check("operation_type_check", sql`(operation_type)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])`),
]);

export const auditLogs = pgTable("audit_logs", {
	id: serial().primaryKey().notNull(),
	eventTimestamp: timestamp("event_timestamp", { withTimezone: true, mode: 'string' }).defaultNow(),
	requestedApi: varchar("requested_api", { length: 255 }),
	appVersion: varchar("app_version", { length: 50 }),
	systemName: varchar("system_name", { length: 100 }),
	systemVersion: varchar("system_version", { length: 50 }),
	userAgent: text("user_agent"),
	ipAddress: varchar("ip_address", { length: 45 }),
	country: varchar({ length: 100 }),
	hostName: varchar("host_name", { length: 255 }),
	tableName: varchar("table_name", { length: 100 }),
	operationType: varchar("operation_type", { length: 50 }),
	severity: varchar({ length: 20 }),
	description: text(),
	details: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_audit_logs_country").using("btree", table.country.asc().nullsLast().op("text_ops")),
	index("idx_audit_logs_event_timestamp").using("btree", table.eventTimestamp.asc().nullsLast().op("timestamptz_ops")),
	index("idx_audit_logs_requested_api").using("btree", table.requestedApi.asc().nullsLast().op("text_ops")),
	index("idx_audit_logs_severity").using("btree", table.severity.asc().nullsLast().op("text_ops")),
	index("idx_audit_logs_table_operation").using("btree", table.tableName.asc().nullsLast().op("text_ops"), table.operationType.asc().nullsLast().op("text_ops")),
	check("operation_type_check", sql`(operation_type)::text = ANY ((ARRAY['VIEW'::character varying, 'INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])`),
	check("severity_check", sql`(severity)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])`),
]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	firstName: varchar("first_name", { length: 100 }),
	lastName: varchar("last_name", { length: 100 }),
	phone: varchar({ length: 20 }),
	isActive: boolean("is_active").default(true).notNull(),
	isEmailVerified: boolean("is_email_verified").default(false).notNull(),
	mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_users_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(deleted_at IS NULL)`),
	unique("users_email_key").on(table.email),
]);

export const roles = pgTable("roles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 50 }).notNull(),
	description: varchar({ length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("roles_name_key").on(table.name),
]);

export const permissions = pgTable("permissions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: varchar({ length: 255 }),
	resource: varchar({ length: 100 }).notNull(),
	action: varchar({ length: 50 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_permissions_resource_action").using("btree", table.resource.asc().nullsLast().op("text_ops"), table.action.asc().nullsLast().op("text_ops")),
	unique("permissions_name_key").on(table.name),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: varchar("token_hash", { length: 255 }).notNull(),
	deviceInfo: varchar("device_info", { length: 500 }),
	ipAddress: varchar("ip_address", { length: 45 }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_refresh_tokens_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(revoked_at IS NULL)`),
	index("idx_refresh_tokens_token_hash").using("btree", table.tokenHash.asc().nullsLast().op("text_ops")),
	index("idx_refresh_tokens_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "refresh_tokens_user_id_fkey"
		}).onDelete("cascade"),
]);

export const apiKeys = pgTable("api_keys", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	keyHash: varchar("key_hash", { length: 255 }).notNull(),
	prefix: varchar({ length: 8 }).notNull(),
	scopes: jsonb().default([]).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_api_keys_key_hash").using("btree", table.keyHash.asc().nullsLast().op("text_ops")),
	index("idx_api_keys_prefix").using("btree", table.prefix.asc().nullsLast().op("text_ops")),
	index("idx_api_keys_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "api_keys_user_id_fkey"
		}).onDelete("cascade"),
]);

export const mfaSettings = pgTable("mfa_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: varchar({ length: 10 }).notNull(),
	secretEncrypted: text("secret_encrypted").notNull(),
	isVerified: boolean("is_verified").default(false).notNull(),
	backupCodesHash: jsonb("backup_codes_hash"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_mfa_settings_user_type").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "mfa_settings_user_id_fkey"
		}).onDelete("cascade"),
	check("mfa_settings_type_check", sql`(type)::text = ANY ((ARRAY['totp'::character varying, 'sms'::character varying])::text[])`),
]);

export const oauthAccounts = pgTable("oauth_accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	provider: varchar({ length: 20 }).notNull(),
	providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
	accessTokenEncrypted: text("access_token_encrypted"),
	refreshTokenEncrypted: text("refresh_token_encrypted"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_oauth_accounts_provider_user").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.providerUserId.asc().nullsLast().op("text_ops")),
	index("idx_oauth_accounts_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "oauth_accounts_user_id_fkey"
		}).onDelete("cascade"),
	check("oauth_accounts_provider_check", sql`(provider)::text = ANY ((ARRAY['google'::character varying, 'github'::character varying, 'apple'::character varying])::text[])`),
]);

export const media = pgTable("media", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	filename: varchar({ length: 500 }).notNull(),
	originalName: varchar("original_name", { length: 500 }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	size: bigint({ mode: "number" }).notNull(),
	storageProvider: varchar("storage_provider", { length: 50 }).notNull(),
	storageKey: varchar("storage_key", { length: 1000 }).notNull(),
	url: text(),
	thumbnailUrl: text("thumbnail_url"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_media_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_media_mime_type").using("btree", table.mimeType.asc().nullsLast().op("text_ops")),
	index("idx_media_storage_provider").using("btree", table.storageProvider.asc().nullsLast().op("text_ops")),
	index("idx_media_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "media_user_id_fkey"
		}).onDelete("cascade"),
]);

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 500 }).notNull(),
	body: text().notNull(),
	type: varchar({ length: 50 }).notNull(),
	data: jsonb().default({}),
	channel: varchar({ length: 20 }).notNull(),
	isRead: boolean("is_read").default(false).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notifications_channel").using("btree", table.channel.asc().nullsLast().op("text_ops")),
	index("idx_notifications_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_notifications_is_read").using("btree", table.userId.asc().nullsLast().op("bool_ops"), table.isRead.asc().nullsLast().op("bool_ops")).where(sql`(is_read = false)`),
	index("idx_notifications_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_fkey"
		}).onDelete("cascade"),
	check("notifications_channel_check", sql`(channel)::text = ANY ((ARRAY['push'::character varying, 'email'::character varying, 'sms'::character varying, 'in-app'::character varying])::text[])`),
]);

export const deviceTokens = pgTable("device_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	token: text().notNull(),
	platform: varchar({ length: 10 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_device_tokens_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("idx_device_tokens_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "device_tokens_user_id_fkey"
		}).onDelete("cascade"),
	check("device_tokens_platform_check", sql`(platform)::text = ANY ((ARRAY['ios'::character varying, 'android'::character varying, 'web'::character varying])::text[])`),
]);

export const documents = pgTable("documents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 500 }),
	source: varchar({ length: 1000 }),
	content: text(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const documentChunks = pgTable("document_chunks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	content: text().notNull(),
	embedding: vector({ dimensions: 1536 }),
	chunkIndex: integer("chunk_index").notNull(),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_document_chunks_document_id").using("btree", table.documentId.asc().nullsLast().op("uuid_ops")),
	index("idx_document_chunks_embedding").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "document_chunks_document_id_fkey"
		}).onDelete("cascade"),
]);

export const conversations = pgTable("conversations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: varchar({ length: 500 }),
	model: varchar({ length: 100 }).notNull(),
	systemPrompt: text("system_prompt"),
	metadata: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_conversations_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_conversations_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "conversations_user_id_fkey"
		}).onDelete("cascade"),
]);

export const messages = pgTable("messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	conversationId: uuid("conversation_id").notNull(),
	role: varchar({ length: 20 }).notNull(),
	content: text().notNull(),
	toolCalls: jsonb("tool_calls"),
	tokenCount: integer("token_count"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_messages_conversation_id").using("btree", table.conversationId.asc().nullsLast().op("uuid_ops")),
	index("idx_messages_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "messages_conversation_id_fkey"
		}).onDelete("cascade"),
	check("messages_role_check", sql`(role)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying, 'system'::character varying, 'tool'::character varying])::text[])`),
]);

export const webhooks = pgTable("webhooks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	url: varchar({ length: 2048 }).notNull(),
	secret: varchar({ length: 255 }).notNull(),
	events: text().array().default([""]).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	description: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_webhooks_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "webhooks_user_id_fkey"
		}).onDelete("cascade"),
]);

export const ciHealingRuns = pgTable("ci_healing_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: varchar({ length: 50 }).default('generic').notNull(),
	repository: varchar({ length: 500 }).notNull(),
	branch: varchar({ length: 255 }).notNull(),
	commitSha: varchar("commit_sha", { length: 100 }).notNull(),
	pipelineUrl: text("pipeline_url"),
	errorHash: varchar("error_hash", { length: 128 }).notNull(),
	errorType: varchar("error_type", { length: 100 }),
	errorSummary: text("error_summary").notNull(),
	status: varchar({ length: 30 }).default('queued').notNull(),
	attemptCount: integer("attempt_count").default(0).notNull(),
	maxAttempts: integer("max_attempts").default(3).notNull(),
	prUrl: text("pr_url"),
	escalationReason: text("escalation_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	prNumber: integer("pr_number"),
	prState: varchar("pr_state", { length: 30 }).default('none').notNull(),
	prBranch: varchar("pr_branch", { length: 255 }),
	aiProvider: varchar("ai_provider", { length: 50 }).default('anthropic').notNull(),
	aiModel: varchar("ai_model", { length: 100 }),
	resolvedBy: varchar("resolved_by", { length: 30 }).default('none').notNull(),
	humanNote: text("human_note"),
}, (table) => [
	uniqueIndex("idx_ci_healing_runs_dedupe").using("btree", table.repository.asc().nullsLast().op("text_ops"), table.commitSha.asc().nullsLast().op("text_ops"), table.errorHash.asc().nullsLast().op("text_ops")),
	index("idx_ci_healing_runs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_ci_healing_runs_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webhookId: uuid("webhook_id").notNull(),
	event: varchar({ length: 255 }).notNull(),
	payload: jsonb().notNull(),
	responseStatus: integer("response_status"),
	responseBody: text("response_body"),
	attempt: integer().default(1).notNull(),
	deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: 'string' }),
	nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 50 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_webhook_deliveries_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_webhook_deliveries_webhook_id").using("btree", table.webhookId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.webhookId],
			foreignColumns: [webhooks.id],
			name: "webhook_deliveries_webhook_id_fkey"
		}).onDelete("cascade"),
]);

export const ciHealingAttempts = pgTable("ci_healing_attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	attemptNo: integer("attempt_no").notNull(),
	status: varchar({ length: 30 }).notNull(),
	diagnosis: text(),
	proposedFix: text("proposed_fix"),
	validationLog: text("validation_log"),
	failureReason: text("failure_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_ci_healing_attempts_run_attempt").using("btree", table.runId.asc().nullsLast().op("int4_ops"), table.attemptNo.asc().nullsLast().op("int4_ops")),
	index("idx_ci_healing_attempts_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [ciHealingRuns.id],
			name: "ci_healing_attempts_run_id_fkey"
		}).onDelete("cascade"),
]);

export const drizzleMigrations = pgTable("__drizzle_migrations", {
	id: serial().primaryKey().notNull(),
	hash: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }),
}, (table) => [
	unique("__drizzle_migrations_hash_key").on(table.hash),
]);

export const ciHealingEvents = pgTable("ci_healing_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	runId: uuid("run_id").notNull(),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	actor: varchar({ length: 30 }).default('system').notNull(),
	message: text().notNull(),
	payload: jsonb().default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ci_healing_events_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_ci_healing_events_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_ci_healing_events_run_id").using("btree", table.runId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.runId],
			foreignColumns: [ciHealingRuns.id],
			name: "ci_healing_events_run_id_fkey"
		}).onDelete("cascade"),
]);

export const repositorySettings = pgTable("repository_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id").notNull(),
	slackChannel: varchar("slack_channel", { length: 100 }),
	slackWebhookUrl: varchar("slack_webhook_url", { length: 500 }),
	maxJobsPerDay: integer("max_jobs_per_day").default(10).notNull(),
	maxRetries: integer("max_retries").default(3).notNull(),
	tokenBudgetPerJob: integer("token_budget_per_job").default(100000).notNull(),
	allowedFailureTypes: json("allowed_failure_types"),
	blockedBranches: json("blocked_branches"),
	createDraftPr: boolean("create_draft_pr").default(true).notNull(),
	autoMergePr: boolean("auto_merge_pr").default(false).notNull(),
	autoMergeThreshold: real("auto_merge_threshold").default(0.95).notNull(),
	notifyOnStart: boolean("notify_on_start").default(false).notNull(),
	notifyOnSuperseded: boolean("notify_on_superseded").default(true).notNull(),
	validationWorkflowFile: varchar("validation_workflow_file", { length: 100 }).default('healops-validation.yml').notNull(),
	pathLanguageMap: json("path_language_map"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "repository_settings_repository_id_fkey"
		}),
	unique("repository_settings_repository_id_key").on(table.repositoryId),
]);

export const branches = pgTable("branches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	isHealopsBranch: boolean("is_healops_branch").default(false).notNull(),
	isProtected: boolean("is_protected").default(false).notNull(),
	autoDeleteAfter: timestamp("auto_delete_after", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_branches_healops_cleanup").using("btree", table.isHealopsBranch.asc().nullsLast().op("bool_ops"), table.autoDeleteAfter.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("idx_branches_repo_name").using("btree", table.repositoryId.asc().nullsLast().op("uuid_ops"), table.name.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "branches_repository_id_fkey"
		}),
]);

export const pipelineRuns = pgTable("pipeline_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	commitId: uuid("commit_id").notNull(),
	webhookEventId: uuid("webhook_event_id"),
	externalRunId: varchar("external_run_id", { length: 255 }).notNull(),
	workflowName: varchar("workflow_name", { length: 255 }),
	provider: varchar({ length: 50 }).notNull(),
	status: varchar({ length: 50 }).notNull(),
	logUrl: varchar("log_url", { length: 500 }),
	extractedLogSnippet: text("extracted_log_snippet"),
	rerunTriggered: boolean("rerun_triggered").default(false).notNull(),
	rerunPassed: boolean("rerun_passed"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	agentBranch: varchar("agent_branch", { length: 255 }),
	fixAttempt: integer("fix_attempt").default(0).notNull(),
	maxFixAttempts: integer("max_fix_attempts").default(3).notNull(),
}, (table) => [
	index("idx_pipeline_runs_commit_status").using("btree", table.commitId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	index("idx_pipeline_runs_external_run_id").using("btree", table.externalRunId.asc().nullsLast().op("text_ops")),
	index("idx_pipeline_runs_workflow_name").using("btree", table.workflowName.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.commitId],
			foreignColumns: [commits.id],
			name: "pipeline_runs_commit_id_fkey"
		}),
	foreignKey({
			columns: [table.webhookEventId],
			foreignColumns: [webhookEvents.id],
			name: "pipeline_runs_webhook_event_id_fkey"
		}),
]);

export const commits = pgTable("commits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id").notNull(),
	branchId: uuid("branch_id").notNull(),
	commitSha: varchar("commit_sha", { length: 40 }).notNull(),
	author: varchar({ length: 255 }).notNull(),
	message: text(),
	source: varchar({ length: 50 }).default('developer').notNull(),
	committedAt: timestamp("committed_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_commits_branch_source").using("btree", table.branchId.asc().nullsLast().op("text_ops"), table.source.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_commits_repo_sha").using("btree", table.repositoryId.asc().nullsLast().op("text_ops"), table.commitSha.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "commits_repository_id_fkey"
		}),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "commits_branch_id_fkey"
		}),
]);

export const organizations = pgTable("organizations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	plan: varchar({ length: 50 }).default('free').notNull(),
	slackWebhookUrl: varchar("slack_webhook_url", { length: 500 }),
	monthlyJobLimit: integer("monthly_job_limit").default(100),
	monthlyTokenBudget: integer("monthly_token_budget").default(1000000),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	slug: varchar({ length: 100 }).notNull(),
}, (table) => [
	uniqueIndex("idx_organizations_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
]);

export const webhookEvents = pgTable("webhook_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id").notNull(),
	provider: varchar({ length: 50 }).notNull(),
	eventType: varchar("event_type", { length: 100 }).notNull(),
	externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
	payload: json().notNull(),
	signatureValid: boolean("signature_valid").notNull(),
	processed: boolean().default(false).notNull(),
	processingError: text("processing_error"),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_webhook_events_external_id").using("btree", table.externalEventId.asc().nullsLast().op("text_ops")),
	index("idx_webhook_events_repo_processed").using("btree", table.repositoryId.asc().nullsLast().op("bool_ops"), table.processed.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "webhook_events_repository_id_fkey"
		}),
]);

export const repositories = pgTable("repositories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	provider: varchar({ length: 50 }).notNull(),
	externalRepoId: varchar("external_repo_id", { length: 255 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	defaultBranch: varchar("default_branch", { length: 100 }).default('main').notNull(),
	primaryLanguage: varchar("primary_language", { length: 50 }),
	isActive: boolean("is_active").default(true).notNull(),
	webhookSecret: varchar("webhook_secret", { length: 500 }),
	githubInstallationId: varchar("github_installation_id", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	ciProviderConfigId: uuid("ci_provider_config_id"),
}, (table) => [
	index("idx_repositories_ci_provider_config").using("btree", table.ciProviderConfigId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_repositories_provider_external_repo_id").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.externalRepoId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "repositories_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.ciProviderConfigId],
			foreignColumns: [ciProviderConfigs.id],
			name: "repositories_ci_provider_config_id_fkey"
		}),
]);

export const jobs = pgTable("jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	failureId: uuid("failure_id"),
	status: varchar({ length: 50 }).default('queued').notNull(),
	classifiedFailureType: varchar("classified_failure_type", { length: 100 }),
	confidence: real(),
	maxRetries: integer("max_retries").default(3).notNull(),
	currentRetry: integer("current_retry").default(0).notNull(),
	tokenBudget: integer("token_budget").default(100000).notNull(),
	totalTokensUsed: integer("total_tokens_used").default(0).notNull(),
	supersededByCommit: varchar("superseded_by_commit", { length: 40 }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	fixRequestId: uuid("fix_request_id"),
}, (table) => [
	index("idx_jobs_failure_status").using("btree", table.failureId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_jobs_fix_request").using("btree", table.fixRequestId.asc().nullsLast().op("uuid_ops")),
	index("idx_jobs_status_created").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.failureId],
			foreignColumns: [failures.id],
			name: "jobs_failure_id_fkey"
		}),
	foreignKey({
			columns: [table.fixRequestId],
			foreignColumns: [fixRequests.id],
			name: "jobs_fix_request_id_fkey"
		}),
]);

export const attempts = pgTable("attempts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	attemptNumber: integer("attempt_number").notNull(),
	analysisOutput: json("analysis_output"),
	fixFingerprint: varchar("fix_fingerprint", { length: 64 }),
	secretRedactionsCount: integer("secret_redactions_count").default(0).notNull(),
	validationRunId: uuid("validation_run_id"),
	inputTokens: integer("input_tokens").default(0).notNull(),
	outputTokens: integer("output_tokens").default(0).notNull(),
	totalTokens: integer("total_tokens").default(0).notNull(),
	latencyMs: integer("latency_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	steps: jsonb().default([]),
}, (table) => [
	index("idx_attempts_job_fingerprint").using("btree", table.jobId.asc().nullsLast().op("uuid_ops"), table.fixFingerprint.asc().nullsLast().op("text_ops")),
	index("idx_attempts_job_number").using("btree", table.jobId.asc().nullsLast().op("uuid_ops"), table.attemptNumber.asc().nullsLast().op("uuid_ops")),
	index("idx_attempts_validation_run").using("btree", table.validationRunId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "attempts_job_id_fkey"
		}),
	foreignKey({
			columns: [table.validationRunId],
			foreignColumns: [pipelineRuns.id],
			name: "attempts_validation_run_id_fkey"
		}),
]);

export const failures = pgTable("failures", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	pipelineRunId: uuid("pipeline_run_id").notNull(),
	errorTypeId: uuid("error_type_id").notNull(),
	errorSummary: text("error_summary").notNull(),
	errorHash: varchar("error_hash", { length: 64 }).notNull(),
	rawErrorLog: text("raw_error_log"),
	affectedFile: varchar("affected_file", { length: 500 }),
	affectedLine: integer("affected_line"),
	language: varchar({ length: 50 }).notNull(),
	isFlaky: boolean("is_flaky").default(false).notNull(),
	detectedAt: timestamp("detected_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_failures_error_hash").using("btree", table.errorHash.asc().nullsLast().op("text_ops")),
	index("idx_failures_is_flaky").using("btree", table.isFlaky.asc().nullsLast().op("bool_ops")),
	uniqueIndex("idx_failures_pipeline_hash").using("btree", table.pipelineRunId.asc().nullsLast().op("text_ops"), table.errorHash.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.pipelineRunId],
			foreignColumns: [pipelineRuns.id],
			name: "failures_pipeline_run_id_fkey"
		}),
	foreignKey({
			columns: [table.errorTypeId],
			foreignColumns: [errorTypes.id],
			name: "failures_error_type_id_fkey"
		}),
]);

export const errorTypes = pgTable("error_types", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 100 }).notNull(),
	description: text().notNull(),
	severity: varchar({ length: 20 }).default('medium').notNull(),
	isAutoFixable: boolean("is_auto_fixable").default(true).notNull(),
	avgFixTimeMs: integer("avg_fix_time_ms"),
}, (table) => [
	unique("error_types_code_key").on(table.code),
]);

export const flakyFailureRegistry = pgTable("flaky_failure_registry", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id").notNull(),
	errorHash: varchar("error_hash", { length: 64 }).notNull(),
	testName: varchar("test_name", { length: 500 }),
	occurrenceCount: integer("occurrence_count").default(1).notNull(),
	distinctCommits: integer("distinct_commits").default(1).notNull(),
	flakyConfirmed: boolean("flaky_confirmed").default(false).notNull(),
	suppressedUntil: timestamp("suppressed_until", { withTimezone: true, mode: 'string' }),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_flaky_confirmed").using("btree", table.flakyConfirmed.asc().nullsLast().op("bool_ops")),
	uniqueIndex("idx_flaky_repo_hash").using("btree", table.repositoryId.asc().nullsLast().op("text_ops"), table.errorHash.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "flaky_failure_registry_repository_id_fkey"
		}),
]);

export const patches = pgTable("patches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	attemptId: uuid("attempt_id").notNull(),
	diffContent: text("diff_content").notNull(),
	filesModified: json("files_modified").notNull(),
	patchSize: integer("patch_size").notNull(),
	hasTypeAssertions: boolean("has_type_assertions").default(false).notNull(),
	hasEmptyCatch: boolean("has_empty_catch").default(false).notNull(),
	securityScanStatus: varchar("security_scan_status", { length: 50 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.attemptId],
			foreignColumns: [attempts.id],
			name: "patches_attempt_id_fkey"
		}),
	unique("patches_attempt_id_key").on(table.attemptId),
]);

export const validations = pgTable("validations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	attemptId: uuid("attempt_id").notNull(),
	stage: varchar({ length: 20 }).notNull(),
	buildStatus: varchar("build_status", { length: 20 }).notNull(),
	testStatus: varchar("test_status", { length: 20 }).notNull(),
	buildLogExcerpt: text("build_log_excerpt"),
	testLogExcerpt: text("test_log_excerpt"),
	buildLogUrl: varchar("build_log_url", { length: 500 }),
	testLogUrl: varchar("test_log_url", { length: 500 }),
	runtimeVersion: varchar("runtime_version", { length: 50 }),
	coveragePercent: real("coverage_percent"),
	securityScanStatus: varchar("security_scan_status", { length: 50 }),
	executionTimeMs: integer("execution_time_ms"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_validations_attempt_stage").using("btree", table.attemptId.asc().nullsLast().op("text_ops"), table.stage.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.attemptId],
			foreignColumns: [attempts.id],
			name: "validations_attempt_id_fkey"
		}),
]);

export const pullRequests = pgTable("pull_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	externalPrId: varchar("external_pr_id", { length: 100 }).notNull(),
	prUrl: varchar("pr_url", { length: 500 }).notNull(),
	sourceBranch: varchar("source_branch", { length: 255 }).notNull(),
	targetBranch: varchar("target_branch", { length: 255 }).notNull(),
	status: varchar({ length: 50 }).default('open').notNull(),
	isDraft: boolean("is_draft").default(true).notNull(),
	supersededAt: timestamp("superseded_at", { withTimezone: true, mode: 'string' }),
	supersededByCommit: varchar("superseded_by_commit", { length: 40 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	mergedAt: timestamp("merged_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_pr_job_status").using("btree", table.jobId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	index("idx_pr_target_status").using("btree", table.targetBranch.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "pull_requests_job_id_fkey"
		}),
]);

export const escalations = pgTable("escalations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	escalationType: varchar("escalation_type", { length: 50 }).notNull(),
	externalIssueId: varchar("external_issue_id", { length: 100 }),
	issueUrl: varchar("issue_url", { length: 500 }),
	reason: text().notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_escalations_job_type").using("btree", table.jobId.asc().nullsLast().op("text_ops"), table.escalationType.asc().nullsLast().op("text_ops")),
	index("idx_escalations_resolved").using("btree", table.resolvedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "escalations_job_id_fkey"
		}),
]);

export const vectorMemory = pgTable("vector_memory", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id"),
	jobId: uuid("job_id").notNull(),
	errorEmbedding: vector("error_embedding", { dimensions: 1536 }),
	contextHash: varchar("context_hash", { length: 64 }).notNull(),
	failureType: varchar("failure_type", { length: 100 }).notNull(),
	language: varchar({ length: 50 }).notNull(),
	successfulPatch: text("successful_patch").notNull(),
	confidence: real().notNull(),
	usageCount: integer("usage_count").default(0).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("idx_vector_memory_context_hash").using("btree", table.contextHash.asc().nullsLast().op("text_ops")),
	index("idx_vector_memory_embedding").using("hnsw", table.errorEmbedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	index("idx_vector_memory_repo_lang_type").using("btree", table.repositoryId.asc().nullsLast().op("uuid_ops"), table.language.asc().nullsLast().op("text_ops"), table.failureType.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "vector_memory_repository_id_fkey"
		}),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "vector_memory_job_id_fkey"
		}),
	unique("vector_memory_context_hash_key").on(table.contextHash),
]);

export const slackNotifications = pgTable("slack_notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	type: varchar({ length: 100 }).notNull(),
	channel: varchar({ length: 100 }),
	status: varchar({ length: 20 }).default('sent').notNull(),
	slackThreadTs: varchar("slack_thread_ts", { length: 50 }),
	messagePreview: varchar("message_preview", { length: 200 }),
	payload: json().notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_slack_job_type").using("btree", table.jobId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "slack_notifications_job_id_fkey"
		}),
]);

export const healopsAuditLogs = pgTable("healops_audit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityType: varchar("entity_type", { length: 100 }).notNull(),
	entityId: uuid("entity_id").notNull(),
	action: varchar({ length: 100 }).notNull(),
	actorType: varchar("actor_type", { length: 50 }).notNull(),
	actorId: varchar("actor_id", { length: 255 }),
	oldValue: json("old_value"),
	newValue: json("new_value"),
	metadata: json(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_pp_audit_created").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_pp_audit_entity").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
]);

export const costTracking = pgTable("cost_tracking", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	repositoryId: uuid("repository_id"),
	periodMonth: date("period_month").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalInputTokens: bigint("total_input_tokens", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalOutputTokens: bigint("total_output_tokens", { mode: "number" }).default(0).notNull(),
	totalJobs: integer("total_jobs").default(0).notNull(),
	totalJobsSucceeded: integer("total_jobs_succeeded").default(0).notNull(),
	totalJobsEscalated: integer("total_jobs_escalated").default(0).notNull(),
	estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale:  4 }).default('0').notNull(),
	budgetLimitUsd: numeric("budget_limit_usd", { precision: 10, scale:  4 }),
	budgetExhausted: boolean("budget_exhausted").default(false).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cost_budget_exhausted").using("btree", table.budgetExhausted.asc().nullsLast().op("bool_ops")),
	uniqueIndex("idx_cost_org_repo_month").using("btree", table.organizationId.asc().nullsLast().op("date_ops"), table.repositoryId.asc().nullsLast().op("uuid_ops"), table.periodMonth.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "cost_tracking_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "cost_tracking_repository_id_fkey"
		}),
]);

export const jobCooldowns = pgTable("job_cooldowns", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	repositoryId: uuid("repository_id").notNull(),
	branchName: varchar("branch_name", { length: 255 }).notNull(),
	failureType: varchar("failure_type", { length: 100 }).notNull(),
	triggeredByJobId: uuid("triggered_by_job_id").notNull(),
	cooldownReason: varchar("cooldown_reason", { length: 50 }).notNull(),
	cooldownUntil: timestamp("cooldown_until", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cooldown_repo_branch_type").using("btree", table.repositoryId.asc().nullsLast().op("text_ops"), table.branchName.asc().nullsLast().op("text_ops"), table.failureType.asc().nullsLast().op("text_ops")),
	index("idx_cooldown_until").using("btree", table.cooldownUntil.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "job_cooldowns_repository_id_fkey"
		}),
	foreignKey({
			columns: [table.triggeredByJobId],
			foreignColumns: [jobs.id],
			name: "job_cooldowns_triggered_by_job_id_fkey"
		}),
]);

export const fixRequests = pgTable("fix_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	errorMessage: text("error_message").notNull(),
	codeSnippet: text("code_snippet").notNull(),
	lineNumber: integer("line_number").notNull(),
	filePath: varchar("file_path", { length: 500 }),
	language: varchar({ length: 50 }),
	branch: varchar({ length: 255 }).notNull(),
	commitSha: varchar("commit_sha", { length: 40 }).notNull(),
	errorHash: varchar("error_hash", { length: 64 }).notNull(),
	classifiedErrorType: varchar("classified_error_type", { length: 100 }),
	isInScope: boolean("is_in_scope"),
	scopeReason: text("scope_reason"),
	status: varchar({ length: 50 }).default('received').notNull(),
	jobId: uuid("job_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_fix_requests_branch_commit").using("btree", table.branch.asc().nullsLast().op("text_ops"), table.commitSha.asc().nullsLast().op("text_ops")),
	index("idx_fix_requests_error_hash").using("btree", table.errorHash.asc().nullsLast().op("text_ops")),
	index("idx_fix_requests_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "fix_requests_job_id_fkey"
		}),
]);

export const ciProviderConfigs = pgTable("ci_provider_configs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	providerType: varchar("provider_type", { length: 50 }).notNull(),
	config: jsonb().default({}).notNull(),
	displayName: varchar("display_name", { length: 255 }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ci_provider_configs_org_type").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.providerType.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("idx_ci_provider_configs_org_type_active").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.providerType.asc().nullsLast().op("text_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "ci_provider_configs_organization_id_fkey"
		}),
]);

export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	planId: uuid("plan_id").notNull(),
	stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
	stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
	status: varchar({ length: 50 }).default('active').notNull(),
	currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: 'string' }),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
	trialEndsAt: timestamp("trial_ends_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_subscriptions_org_active").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")).where(sql`((status)::text = ANY ((ARRAY['active'::character varying, 'trialing'::character varying, 'past_due'::character varying])::text[]))`),
	index("idx_subscriptions_stripe_customer").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
	index("idx_subscriptions_stripe_sub").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "subscriptions_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [plans.id],
			name: "subscriptions_plan_id_fkey"
		}),
]);

export const plans = pgTable("plans", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	slug: varchar({ length: 100 }).notNull(),
	stripePriceId: varchar("stripe_price_id", { length: 255 }),
	monthlyJobLimit: integer("monthly_job_limit").notNull(),
	monthlyTokenBudget: integer("monthly_token_budget").notNull(),
	features: jsonb().default([]).notNull(),
	priceCents: integer("price_cents").default(0).notNull(),
	billingInterval: varchar("billing_interval", { length: 20 }).default('month').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_plans_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	unique("plans_slug_key").on(table.slug),
]);

export const usageRecords = pgTable("usage_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	subscriptionId: uuid("subscription_id").notNull(),
	periodMonth: date("period_month").notNull(),
	jobsUsed: integer("jobs_used").default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tokensUsed: bigint("tokens_used", { mode: "number" }).default(0).notNull(),
	reportedToStripe: boolean("reported_to_stripe").default(false).notNull(),
	stripeUsageRecordId: varchar("stripe_usage_record_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_usage_records_org_sub_month").using("btree", table.organizationId.asc().nullsLast().op("date_ops"), table.subscriptionId.asc().nullsLast().op("date_ops"), table.periodMonth.asc().nullsLast().op("date_ops")),
	index("idx_usage_records_unreported").using("btree", table.reportedToStripe.asc().nullsLast().op("bool_ops")).where(sql`(reported_to_stripe = false)`),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "usage_records_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [subscriptions.id],
			name: "usage_records_subscription_id_fkey"
		}),
]);

export const notificationSettings = pgTable("notification_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	userId: uuid("user_id"),
	channel: varchar({ length: 50 }).notNull(),
	events: jsonb().default([]).notNull(),
	config: jsonb().default({}).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_notification_settings_org_active").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	uniqueIndex("idx_notification_settings_org_user_channel").using("btree", sql`organization_id`, sql`COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`channel`),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "notification_settings_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notification_settings_user_id_fkey"
		}),
]);

export const invoices = pgTable("invoices", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }),
	amountCents: integer("amount_cents").default(0).notNull(),
	currency: varchar({ length: 3 }).default('usd').notNull(),
	status: varchar({ length: 50 }).default('draft').notNull(),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	periodStart: timestamp("period_start", { withTimezone: true, mode: 'string' }),
	periodEnd: timestamp("period_end", { withTimezone: true, mode: 'string' }),
	hostedInvoiceUrl: varchar("hosted_invoice_url", { length: 1000 }),
	pdfUrl: varchar("pdf_url", { length: 1000 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_invoices_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_invoices_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "invoices_organization_id_fkey"
		}),
	unique("invoices_stripe_invoice_id_key").on(table.stripeInvoiceId),
]);

export const organizationMembers = pgTable("organization_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	userId: uuid("user_id").notNull(),
	role: varchar({ length: 50 }).default('member').notNull(),
	invitedBy: uuid("invited_by"),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_org_members_org_user").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_org_members_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "organization_members_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "organization_members_user_id_fkey"
		}),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [users.id],
			name: "organization_members_invited_by_fkey"
		}),
]);

export const organizationInvitations = pgTable("organization_invitations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	email: varchar({ length: 255 }).notNull(),
	role: varchar({ length: 50 }).default('member').notNull(),
	token: varchar({ length: 255 }).notNull(),
	invitedBy: uuid("invited_by"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 50 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_org_invitations_org_email").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.email.asc().nullsLast().op("text_ops")),
	index("idx_org_invitations_pending").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`((status)::text = 'pending'::text)`),
	index("idx_org_invitations_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "organization_invitations_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [users.id],
			name: "organization_invitations_invited_by_fkey"
		}),
	unique("organization_invitations_token_key").on(table.token),
]);

export const onboardingProgress = pgTable("onboarding_progress", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	userId: uuid("user_id").notNull(),
	currentStep: varchar("current_step", { length: 100 }).default('create_organization').notNull(),
	completedSteps: jsonb("completed_steps").default([]).notNull(),
	data: jsonb().default({}).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_onboarding_incomplete").using("btree", table.completedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(completed_at IS NULL)`),
	uniqueIndex("idx_onboarding_org_user").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "onboarding_progress_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "onboarding_progress_user_id_fkey"
		}),
]);

export const dashboardSnapshots = pgTable("dashboard_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	repositoryId: uuid("repository_id"),
	snapshotType: varchar("snapshot_type", { length: 20 }).notNull(),
	snapshotDate: date("snapshot_date").notNull(),
	metrics: jsonb().default({}).notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_dashboard_snapshot_key").using("btree", sql`organization_id`, sql`COALESCE(repository_id, '00000000-0000-0000-0000-000000000000':`, sql`snapshot_type`, sql`snapshot_date`),
	index("idx_dashboard_snapshots_org_type").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.snapshotType.asc().nullsLast().op("text_ops"), table.snapshotDate.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "dashboard_snapshots_organization_id_fkey"
		}),
	foreignKey({
			columns: [table.repositoryId],
			foreignColumns: [repositories.id],
			name: "dashboard_snapshots_repository_id_fkey"
		}),
]);

export const rolePermissions = pgTable("role_permissions", {
	roleId: uuid("role_id").notNull(),
	permissionId: uuid("permission_id").notNull(),
}, (table) => [
	index("idx_role_permissions_role_id").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "role_permissions_role_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.permissionId],
			foreignColumns: [permissions.id],
			name: "role_permissions_permission_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.roleId, table.permissionId], name: "role_permissions_pkey"}),
]);

export const userRoles = pgTable("user_roles", {
	userId: uuid("user_id").notNull(),
	roleId: uuid("role_id").notNull(),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_roles_role_id").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_roles_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_roles_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "user_roles_role_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.roleId], name: "user_roles_pkey"}),
]);
