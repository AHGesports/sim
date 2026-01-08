import { pgTable, index, text, timestamp, uniqueIndex, foreignKey, unique, boolean, jsonb, integer, numeric, doublePrecision, json, check, uuid, vector, bigint, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const billingBlockedReason = pgEnum("billing_blocked_reason", ['payment_failed', 'dispute'])
export const browserProfileProviderType = pgEnum("browser_profile_provider_type", ['own_browser', 'more_login'])
export const dbBudgetTier = pgEnum("db_budget_tier", ['free', 'paid', 'enterprise', 'custom'])
export const dbOwnershipType = pgEnum("db_ownership_type", ['platform', 'user'])
export const notificationDeliveryStatus = pgEnum("notification_delivery_status", ['pending', 'in_progress', 'success', 'failed'])
export const notificationType = pgEnum("notification_type", ['webhook', 'email', 'slack'])
export const permissionType = pgEnum("permission_type", ['admin', 'write', 'read'])
export const profileScope = pgEnum("profile_scope", ['global', 'workspace'])
export const templateCreatorType = pgEnum("template_creator_type", ['user', 'organization'])
export const templateStatus = pgEnum("template_status", ['pending', 'approved', 'rejected'])
export const usageLogCategory = pgEnum("usage_log_category", ['model', 'fixed'])
export const usageLogSource = pgEnum("usage_log_source", ['workflow', 'wand', 'copilot'])
export const workspaceInvitationStatus = pgEnum("workspace_invitation_status", ['pending', 'accepted', 'rejected', 'cancelled'])


export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
}, (table) => [
	index("verification_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	index("account_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	uniqueIndex("account_user_provider_account_unique").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.providerId.asc().nullsLast().op("text_ops"), table.accountId.asc().nullsLast().op("text_ops")),
	index("idx_account_on_account_id_provider_id").using("btree", table.accountId.asc().nullsLast().op("text_ops"), table.providerId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const waitlist = pgTable("waitlist", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("waitlist_email_unique").on(table.email),
]);

export const workspaceNotificationSubscription = pgTable("workspace_notification_subscription", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	notificationType: notificationType("notification_type").notNull(),
	workflowIds: text("workflow_ids").array().default([""]).notNull(),
	allWorkflows: boolean("all_workflows").default(false).notNull(),
	levelFilter: text("level_filter").array().default(["RAY['info'::text", "'error'::tex"]).notNull(),
	triggerFilter: text("trigger_filter").array().default(["RAY['api'::text", "'webhook'::text", "'schedule'::text", "'manual'::text", "'chat'::tex"]).notNull(),
	includeFinalOutput: boolean("include_final_output").default(false).notNull(),
	includeTraceSpans: boolean("include_trace_spans").default(false).notNull(),
	includeRateLimits: boolean("include_rate_limits").default(false).notNull(),
	includeUsageData: boolean("include_usage_data").default(false).notNull(),
	webhookConfig: jsonb("webhook_config"),
	emailRecipients: text("email_recipients").array(),
	slackConfig: jsonb("slack_config"),
	alertConfig: jsonb("alert_config"),
	lastAlertAt: timestamp("last_alert_at", { mode: 'string' }),
	active: boolean().default(true).notNull(),
	createdBy: text("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_notification_active_idx").using("btree", table.active.asc().nullsLast().op("bool_ops")),
	index("workspace_notification_type_idx").using("btree", table.notificationType.asc().nullsLast().op("enum_ops")),
	index("workspace_notification_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_notification_subscription_workspace_id_workspace_id_f"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "workspace_notification_subscription_created_by_user_id_fk"
		}).onDelete("cascade"),
]);

export const workspaceNotificationDelivery = pgTable("workspace_notification_delivery", {
	id: text().primaryKey().notNull(),
	subscriptionId: text("subscription_id").notNull(),
	workflowId: text("workflow_id").notNull(),
	executionId: text("execution_id").notNull(),
	status: notificationDeliveryStatus().default('pending').notNull(),
	attempts: integer().default(0).notNull(),
	lastAttemptAt: timestamp("last_attempt_at", { mode: 'string' }),
	nextAttemptAt: timestamp("next_attempt_at", { mode: 'string' }),
	responseStatus: integer("response_status"),
	responseBody: text("response_body"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_notification_delivery_execution_id_idx").using("btree", table.executionId.asc().nullsLast().op("text_ops")),
	index("workspace_notification_delivery_next_attempt_idx").using("btree", table.nextAttemptAt.asc().nullsLast().op("timestamp_ops")),
	index("workspace_notification_delivery_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("workspace_notification_delivery_subscription_id_idx").using("btree", table.subscriptionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [workspaceNotificationSubscription.id],
			name: "workspace_notification_delivery_subscription_id_workspace_notif"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workspace_notification_delivery_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
]);

export const rateLimitBucket = pgTable("rate_limit_bucket", {
	key: text().primaryKey().notNull(),
	tokens: numeric().notNull(),
	lastRefillAt: timestamp("last_refill_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const document = pgTable("document", {
	id: text().primaryKey().notNull(),
	knowledgeBaseId: text("knowledge_base_id").notNull(),
	filename: text().notNull(),
	fileUrl: text("file_url").notNull(),
	fileSize: integer("file_size").notNull(),
	mimeType: text("mime_type").notNull(),
	chunkCount: integer("chunk_count").default(0).notNull(),
	tokenCount: integer("token_count").default(0).notNull(),
	characterCount: integer("character_count").default(0).notNull(),
	enabled: boolean().default(true).notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
	tag1: text(),
	tag2: text(),
	tag3: text(),
	tag4: text(),
	tag5: text(),
	tag6: text(),
	tag7: text(),
	processingStatus: text("processing_status").default('pending').notNull(),
	processingStartedAt: timestamp("processing_started_at", { mode: 'string' }),
	processingCompletedAt: timestamp("processing_completed_at", { mode: 'string' }),
	processingError: text("processing_error"),
	number1: doublePrecision(),
	number2: doublePrecision(),
	number3: doublePrecision(),
	number4: doublePrecision(),
	number5: doublePrecision(),
	date1: timestamp({ mode: 'string' }),
	date2: timestamp({ mode: 'string' }),
	boolean1: boolean(),
	boolean2: boolean(),
	boolean3: boolean(),
}, (table) => [
	index("doc_boolean1_idx").using("btree", table.boolean1.asc().nullsLast().op("bool_ops")),
	index("doc_boolean2_idx").using("btree", table.boolean2.asc().nullsLast().op("bool_ops")),
	index("doc_boolean3_idx").using("btree", table.boolean3.asc().nullsLast().op("bool_ops")),
	index("doc_date1_idx").using("btree", table.date1.asc().nullsLast().op("timestamp_ops")),
	index("doc_date2_idx").using("btree", table.date2.asc().nullsLast().op("timestamp_ops")),
	index("doc_filename_idx").using("btree", table.filename.asc().nullsLast().op("text_ops")),
	index("doc_kb_id_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("text_ops")),
	index("doc_number1_idx").using("btree", table.number1.asc().nullsLast().op("float8_ops")),
	index("doc_number2_idx").using("btree", table.number2.asc().nullsLast().op("float8_ops")),
	index("doc_number3_idx").using("btree", table.number3.asc().nullsLast().op("float8_ops")),
	index("doc_number4_idx").using("btree", table.number4.asc().nullsLast().op("float8_ops")),
	index("doc_number5_idx").using("btree", table.number5.asc().nullsLast().op("float8_ops")),
	index("doc_processing_status_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("text_ops"), table.processingStatus.asc().nullsLast().op("text_ops")),
	index("doc_tag1_idx").using("btree", table.tag1.asc().nullsLast().op("text_ops")),
	index("doc_tag2_idx").using("btree", table.tag2.asc().nullsLast().op("text_ops")),
	index("doc_tag3_idx").using("btree", table.tag3.asc().nullsLast().op("text_ops")),
	index("doc_tag4_idx").using("btree", table.tag4.asc().nullsLast().op("text_ops")),
	index("doc_tag5_idx").using("btree", table.tag5.asc().nullsLast().op("text_ops")),
	index("doc_tag6_idx").using("btree", table.tag6.asc().nullsLast().op("text_ops")),
	index("doc_tag7_idx").using("btree", table.tag7.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.knowledgeBaseId],
			foreignColumns: [knowledgeBase.id],
			name: "document_knowledge_base_id_knowledge_base_id_fk"
		}).onDelete("cascade"),
]);

export const environment = pgTable("environment", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	variables: json().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "environment_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("environment_user_id_unique").on(table.userId),
]);

export const usageLog = pgTable("usage_log", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	category: usageLogCategory().notNull(),
	source: usageLogSource().notNull(),
	description: text().notNull(),
	metadata: jsonb(),
	cost: numeric().notNull(),
	workspaceId: text("workspace_id"),
	workflowId: text("workflow_id"),
	executionId: text("execution_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("usage_log_source_idx").using("btree", table.source.asc().nullsLast().op("enum_ops")),
	index("usage_log_user_created_at_idx").using("btree", table.userId.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("usage_log_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	index("usage_log_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "usage_log_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "usage_log_workspace_id_workspace_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "usage_log_workflow_id_workflow_id_fk"
		}).onDelete("set null"),
]);

export const workspaceByokKeys = pgTable("workspace_byok_keys", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	providerId: text("provider_id").notNull(),
	encryptedApiKey: text("encrypted_api_key").notNull(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("workspace_byok_provider_unique").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.providerId.asc().nullsLast().op("text_ops")),
	index("workspace_byok_workspace_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_byok_keys_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "workspace_byok_keys_created_by_user_id_fk"
		}).onDelete("set null"),
]);

export const agentProfile = pgTable("agent_profile", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	workspaceId: text("workspace_id"),
	scope: profileScope().notNull(),
	browserProfileId: text("browser_profile_id"),
	name: text().notNull(),
	profileData: jsonb("profile_data").default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("agent_profile_browser_profile_id_idx").using("btree", table.browserProfileId.asc().nullsLast().op("text_ops")),
	index("agent_profile_scope_idx").using("btree", table.scope.asc().nullsLast().op("enum_ops")),
	index("agent_profile_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("agent_profile_user_scope_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.scope.asc().nullsLast().op("enum_ops")),
	index("agent_profile_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "agent_profile_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "agent_profile_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.browserProfileId],
			foreignColumns: [browserProfile.id],
			name: "agent_profile_browser_profile_id_browser_profile_id_fk"
		}).onDelete("set null"),
	check("scope_workspace_check", sql`((scope = 'global'::profile_scope) AND (workspace_id IS NULL)) OR ((scope = 'workspace'::profile_scope) AND (workspace_id IS NOT NULL))`),
]);

export const browserProfile = pgTable("browser_profile", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	providerType: browserProfileProviderType("provider_type").notNull(),
	providerConfig: jsonb("provider_config").default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("browser_profile_provider_type_idx").using("btree", table.providerType.asc().nullsLast().op("enum_ops")),
	index("browser_profile_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "browser_profile_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
	activeOrganizationId: text("active_organization_id"),
}, (table) => [
	index("session_token_idx").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("session_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.activeOrganizationId],
			foreignColumns: [organization.id],
			name: "session_active_organization_id_organization_id_fk"
		}).onDelete("set null"),
	unique("session_token_unique").on(table.token),
]);

export const invitation = pgTable("invitation", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	inviterId: text("inviter_id").notNull(),
	organizationId: text("organization_id").notNull(),
	role: text().notNull(),
	status: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("invitation_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("invitation_organization_id_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.inviterId],
			foreignColumns: [user.id],
			name: "invitation_inviter_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "invitation_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const member = pgTable("member", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	organizationId: text("organization_id").notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("member_organization_id_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops")),
	index("member_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "member_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "member_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const chat = pgTable("chat", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	userId: text("user_id").notNull(),
	identifier: text().notNull(),
	title: text().notNull(),
	description: text(),
	isActive: boolean("is_active").default(true).notNull(),
	customizations: json().default({}),
	authType: text("auth_type").default('public').notNull(),
	password: text(),
	allowedEmails: json("allowed_emails").default([]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	outputConfigs: json("output_configs").default([]),
}, (table) => [
	uniqueIndex("identifier_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "chat_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "chat_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const userDbBudget = pgTable("user_db_budget", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	budgetTier: dbBudgetTier("budget_tier").default('free').notNull(),
	customBudgetCents: integer("custom_budget_cents"),
	budgetExceeded: boolean("budget_exceeded").default(false).notNull(),
	currentPeriodStart: timestamp("current_period_start", { mode: 'string' }).defaultNow().notNull(),
	totalCostCents: integer("total_cost_cents").default(0).notNull(),
	lastSync: timestamp("last_sync", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("user_db_budget_exceeded_idx").using("btree", table.budgetExceeded.asc().nullsLast().op("bool_ops")),
	index("user_db_budget_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_db_budget_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("user_db_budget_user_id_unique").on(table.userId),
]);

export const userGlobalDatabase = pgTable("user_global_database", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	ownershipType: dbOwnershipType("ownership_type").default('platform').notNull(),
	neonProjectId: text("neon_project_id"),
	neonBranchId: text("neon_branch_id"),
	neonConnectionUri: text("neon_connection_uri"),
	databaseName: text("database_name").default('neondb').notNull(),
	currentPeriodCostCents: integer("current_period_cost_cents").default(0).notNull(),
	lastConsumptionSync: timestamp("last_consumption_sync", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("user_global_database_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_global_database_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("user_global_database_user_id_unique").on(table.userId),
]);

export const workspaceDatabase = pgTable("workspace_database", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	ownershipType: dbOwnershipType("ownership_type").default('platform').notNull(),
	neonProjectId: text("neon_project_id"),
	neonBranchId: text("neon_branch_id"),
	neonConnectionUri: text("neon_connection_uri"),
	databaseName: text("database_name").default('neondb').notNull(),
	currentPeriodCostCents: integer("current_period_cost_cents").default(0).notNull(),
	lastConsumptionSync: timestamp("last_consumption_sync", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("workspace_database_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_database_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	unique("workspace_database_workspace_id_unique").on(table.workspaceId),
]);

export const memory = pgTable("memory", {
	id: text().primaryKey().notNull(),
	key: text().notNull(),
	data: jsonb().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	workspaceId: text("workspace_id").notNull(),
}, (table) => [
	index("memory_key_idx").using("btree", table.key.asc().nullsLast().op("text_ops")),
	index("memory_workspace_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	uniqueIndex("memory_workspace_key_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.key.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "memory_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
]);

export const knowledgeBase = pgTable("knowledge_base", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	workspaceId: text("workspace_id"),
	name: text().notNull(),
	description: text(),
	tokenCount: integer("token_count").default(0).notNull(),
	embeddingModel: text("embedding_model").default('text-embedding-3-small').notNull(),
	embeddingDimension: integer("embedding_dimension").default(1536).notNull(),
	chunkingConfig: json("chunking_config").default({"maxSize":1024,"minSize":1,"overlap":200}).notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("kb_deleted_at_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamp_ops")),
	index("kb_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("kb_user_workspace_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.workspaceId.asc().nullsLast().op("text_ops")),
	index("kb_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "knowledge_base_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "knowledge_base_workspace_id_workspace_id_fk"
		}),
]);

export const workflowFolder = pgTable("workflow_folder", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	userId: text("user_id").notNull(),
	workspaceId: text("workspace_id").notNull(),
	parentId: text("parent_id"),
	color: text().default('#6B7280'),
	isExpanded: boolean("is_expanded").default(true).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workflow_folder_parent_sort_idx").using("btree", table.parentId.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("text_ops")),
	index("workflow_folder_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("workflow_folder_workspace_parent_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.parentId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "workflow_folder_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workflow_folder_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "workflow_folder_parent_id_workflow_folder_id_fk"
		}).onDelete("cascade"),
]);

export const workflowEdges = pgTable("workflow_edges", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	sourceBlockId: text("source_block_id").notNull(),
	targetBlockId: text("target_block_id").notNull(),
	sourceHandle: text("source_handle"),
	targetHandle: text("target_handle"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workflow_edges_source_block_fk_idx").using("btree", table.sourceBlockId.asc().nullsLast().op("text_ops")),
	index("workflow_edges_target_block_fk_idx").using("btree", table.targetBlockId.asc().nullsLast().op("text_ops")),
	index("workflow_edges_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	index("workflow_edges_workflow_source_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.sourceBlockId.asc().nullsLast().op("text_ops")),
	index("workflow_edges_workflow_target_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.targetBlockId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_edges_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceBlockId],
			foreignColumns: [workflowBlocks.id],
			name: "workflow_edges_source_block_id_workflow_blocks_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetBlockId],
			foreignColumns: [workflowBlocks.id],
			name: "workflow_edges_target_block_id_workflow_blocks_id_fk"
		}).onDelete("cascade"),
]);

export const workflowSubflows = pgTable("workflow_subflows", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	type: text().notNull(),
	config: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workflow_subflows_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	index("workflow_subflows_workflow_type_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_subflows_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
]);

export const permissions = pgTable("permissions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	entityType: text("entity_type").notNull(),
	entityId: text("entity_id").notNull(),
	permissionType: permissionType("permission_type").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("permissions_entity_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	uniqueIndex("permissions_unique_constraint").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	index("permissions_user_entity_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	index("permissions_user_entity_permission_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.entityType.asc().nullsLast().op("text_ops"), table.permissionType.asc().nullsLast().op("enum_ops")),
	index("permissions_user_entity_type_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.entityType.asc().nullsLast().op("text_ops")),
	index("permissions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "permissions_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const workflowExecutionSnapshots = pgTable("workflow_execution_snapshots", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	stateHash: text("state_hash").notNull(),
	stateData: jsonb("state_data").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workflow_snapshots_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("workflow_snapshots_hash_idx").using("btree", table.stateHash.asc().nullsLast().op("text_ops")),
	uniqueIndex("workflow_snapshots_workflow_hash_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.stateHash.asc().nullsLast().op("text_ops")),
	index("workflow_snapshots_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_execution_snapshots_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
]);

export const docsEmbeddings = pgTable("docs_embeddings", {
	chunkId: uuid("chunk_id").defaultRandom().primaryKey().notNull(),
	chunkText: text("chunk_text").notNull(),
	sourceDocument: text("source_document").notNull(),
	sourceLink: text("source_link").notNull(),
	headerText: text("header_text").notNull(),
	headerLevel: integer("header_level").notNull(),
	tokenCount: integer("token_count").notNull(),
	embedding: vector({ dimensions: 1536 }).notNull(),
	embeddingModel: text("embedding_model").default('text-embedding-3-small').notNull(),
	metadata: jsonb().default({}).notNull(),
	// TODO: failed to parse database type 'tsvector'
	chunkTextTsv: unknown("chunk_text_tsv").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, chunk_text)`),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("docs_emb_chunk_text_fts_idx").using("gin", table.chunkTextTsv.asc().nullsLast().op("tsvector_ops")),
	index("docs_emb_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("docs_emb_header_level_idx").using("btree", table.headerLevel.asc().nullsLast().op("int4_ops")),
	index("docs_emb_metadata_gin_idx").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
	index("docs_emb_model_idx").using("btree", table.embeddingModel.asc().nullsLast().op("text_ops")),
	index("docs_emb_source_document_idx").using("btree", table.sourceDocument.asc().nullsLast().op("text_ops")),
	index("docs_emb_source_header_idx").using("btree", table.sourceDocument.asc().nullsLast().op("text_ops"), table.headerLevel.asc().nullsLast().op("text_ops")),
	index("docs_embedding_vector_hnsw_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	check("docs_embedding_not_null_check", sql`embedding IS NOT NULL`),
	check("docs_header_level_check", sql`(header_level >= 1) AND (header_level <= 6)`),
]);

export const embedding = pgTable("embedding", {
	id: text().primaryKey().notNull(),
	knowledgeBaseId: text("knowledge_base_id").notNull(),
	documentId: text("document_id").notNull(),
	chunkIndex: integer("chunk_index").notNull(),
	chunkHash: text("chunk_hash").notNull(),
	content: text().notNull(),
	contentLength: integer("content_length").notNull(),
	tokenCount: integer("token_count").notNull(),
	embedding: vector({ dimensions: 1536 }).notNull(),
	embeddingModel: text("embedding_model").default('text-embedding-3-small').notNull(),
	startOffset: integer("start_offset").notNull(),
	endOffset: integer("end_offset").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	// TODO: failed to parse database type 'tsvector'
	contentTsv: unknown("content_tsv").generatedAlwaysAs(sql`to_tsvector('english'::regconfig, content)`),
	enabled: boolean().default(true).notNull(),
	tag1: text(),
	tag2: text(),
	tag3: text(),
	tag4: text(),
	tag5: text(),
	tag6: text(),
	tag7: text(),
	number1: doublePrecision(),
	number2: doublePrecision(),
	number3: doublePrecision(),
	number4: doublePrecision(),
	number5: doublePrecision(),
	date1: timestamp({ mode: 'string' }),
	date2: timestamp({ mode: 'string' }),
	boolean1: boolean(),
	boolean2: boolean(),
	boolean3: boolean(),
}, (table) => [
	index("emb_boolean1_idx").using("btree", table.boolean1.asc().nullsLast().op("bool_ops")),
	index("emb_boolean2_idx").using("btree", table.boolean2.asc().nullsLast().op("bool_ops")),
	index("emb_boolean3_idx").using("btree", table.boolean3.asc().nullsLast().op("bool_ops")),
	index("emb_content_fts_idx").using("gin", table.contentTsv.asc().nullsLast().op("tsvector_ops")),
	index("emb_date1_idx").using("btree", table.date1.asc().nullsLast().op("timestamp_ops")),
	index("emb_date2_idx").using("btree", table.date2.asc().nullsLast().op("timestamp_ops")),
	uniqueIndex("emb_doc_chunk_idx").using("btree", table.documentId.asc().nullsLast().op("text_ops"), table.chunkIndex.asc().nullsLast().op("int4_ops")),
	index("emb_doc_enabled_idx").using("btree", table.documentId.asc().nullsLast().op("bool_ops"), table.enabled.asc().nullsLast().op("bool_ops")),
	index("emb_doc_id_idx").using("btree", table.documentId.asc().nullsLast().op("text_ops")),
	index("emb_kb_enabled_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("bool_ops"), table.enabled.asc().nullsLast().op("bool_ops")),
	index("emb_kb_id_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("text_ops")),
	index("emb_kb_model_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("text_ops"), table.embeddingModel.asc().nullsLast().op("text_ops")),
	index("emb_number1_idx").using("btree", table.number1.asc().nullsLast().op("float8_ops")),
	index("emb_number2_idx").using("btree", table.number2.asc().nullsLast().op("float8_ops")),
	index("emb_number3_idx").using("btree", table.number3.asc().nullsLast().op("float8_ops")),
	index("emb_number4_idx").using("btree", table.number4.asc().nullsLast().op("float8_ops")),
	index("emb_number5_idx").using("btree", table.number5.asc().nullsLast().op("float8_ops")),
	index("emb_tag1_idx").using("btree", table.tag1.asc().nullsLast().op("text_ops")),
	index("emb_tag2_idx").using("btree", table.tag2.asc().nullsLast().op("text_ops")),
	index("emb_tag3_idx").using("btree", table.tag3.asc().nullsLast().op("text_ops")),
	index("emb_tag4_idx").using("btree", table.tag4.asc().nullsLast().op("text_ops")),
	index("emb_tag5_idx").using("btree", table.tag5.asc().nullsLast().op("text_ops")),
	index("emb_tag6_idx").using("btree", table.tag6.asc().nullsLast().op("text_ops")),
	index("emb_tag7_idx").using("btree", table.tag7.asc().nullsLast().op("text_ops")),
	index("embedding_vector_hnsw_idx").using("hnsw", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({m: "16",ef_construction: "64"}),
	foreignKey({
			columns: [table.knowledgeBaseId],
			foreignColumns: [knowledgeBase.id],
			name: "embedding_knowledge_base_id_knowledge_base_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [document.id],
			name: "embedding_document_id_document_id_fk"
		}).onDelete("cascade"),
	check("embedding_not_null_check", sql`embedding IS NOT NULL`),
]);

export const templateStars = pgTable("template_stars", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	templateId: text("template_id").notNull(),
	starredAt: timestamp("starred_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("template_stars_starred_at_idx").using("btree", table.starredAt.asc().nullsLast().op("timestamp_ops")),
	index("template_stars_template_id_idx").using("btree", table.templateId.asc().nullsLast().op("text_ops")),
	index("template_stars_template_starred_at_idx").using("btree", table.templateId.asc().nullsLast().op("text_ops"), table.starredAt.asc().nullsLast().op("timestamp_ops")),
	index("template_stars_template_user_idx").using("btree", table.templateId.asc().nullsLast().op("text_ops"), table.userId.asc().nullsLast().op("text_ops")),
	index("template_stars_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("template_stars_user_template_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.templateId.asc().nullsLast().op("text_ops")),
	uniqueIndex("template_stars_user_template_unique").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.templateId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "template_stars_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [templates.id],
			name: "template_stars_template_id_templates_id_fk"
		}).onDelete("cascade"),
]);

export const webhook = pgTable("webhook", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	path: text().notNull(),
	provider: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	providerConfig: json("provider_config"),
	blockId: text("block_id"),
	failedCount: integer("failed_count").default(0),
	lastFailedAt: timestamp("last_failed_at", { mode: 'string' }),
}, (table) => [
	index("idx_webhook_on_workflow_id_block_id").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.blockId.asc().nullsLast().op("text_ops")),
	uniqueIndex("path_idx").using("btree", table.path.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "webhook_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.blockId],
			foreignColumns: [workflowBlocks.id],
			name: "webhook_block_id_workflow_blocks_id_fk"
		}).onDelete("cascade"),
]);

export const knowledgeBaseTagDefinitions = pgTable("knowledge_base_tag_definitions", {
	id: text().primaryKey().notNull(),
	knowledgeBaseId: text("knowledge_base_id").notNull(),
	tagSlot: text("tag_slot").notNull(),
	displayName: text("display_name").notNull(),
	fieldType: text("field_type").default('text').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("kb_tag_definitions_kb_display_name_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("text_ops"), table.displayName.asc().nullsLast().op("text_ops")),
	index("kb_tag_definitions_kb_id_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("text_ops")),
	uniqueIndex("kb_tag_definitions_kb_slot_idx").using("btree", table.knowledgeBaseId.asc().nullsLast().op("text_ops"), table.tagSlot.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.knowledgeBaseId],
			foreignColumns: [knowledgeBase.id],
			name: "knowledge_base_tag_definitions_knowledge_base_id_knowledge_base"
		}).onDelete("cascade"),
]);

export const workflowCheckpoints = pgTable("workflow_checkpoints", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	workflowId: text("workflow_id").notNull(),
	chatId: uuid("chat_id").notNull(),
	messageId: text("message_id"),
	workflowState: json("workflow_state").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workflow_checkpoints_chat_created_at_idx").using("btree", table.chatId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("uuid_ops")),
	index("workflow_checkpoints_chat_id_idx").using("btree", table.chatId.asc().nullsLast().op("uuid_ops")),
	index("workflow_checkpoints_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("workflow_checkpoints_message_id_idx").using("btree", table.messageId.asc().nullsLast().op("text_ops")),
	index("workflow_checkpoints_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("workflow_checkpoints_user_workflow_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.workflowId.asc().nullsLast().op("text_ops")),
	index("workflow_checkpoints_workflow_chat_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.chatId.asc().nullsLast().op("uuid_ops")),
	index("workflow_checkpoints_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "workflow_checkpoints_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_checkpoints_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.chatId],
			foreignColumns: [copilotChats.id],
			name: "workflow_checkpoints_chat_id_copilot_chats_id_fk"
		}).onDelete("cascade"),
]);

export const copilotFeedback = pgTable("copilot_feedback", {
	feedbackId: uuid("feedback_id").defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	chatId: uuid("chat_id").notNull(),
	userQuery: text("user_query").notNull(),
	agentResponse: text("agent_response").notNull(),
	isPositive: boolean("is_positive").notNull(),
	feedback: text(),
	workflowYaml: text("workflow_yaml"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("copilot_feedback_chat_id_idx").using("btree", table.chatId.asc().nullsLast().op("uuid_ops")),
	index("copilot_feedback_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("copilot_feedback_is_positive_idx").using("btree", table.isPositive.asc().nullsLast().op("bool_ops")),
	index("copilot_feedback_user_chat_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.chatId.asc().nullsLast().op("text_ops")),
	index("copilot_feedback_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "copilot_feedback_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.chatId],
			foreignColumns: [copilotChats.id],
			name: "copilot_feedback_chat_id_copilot_chats_id_fk"
		}).onDelete("cascade"),
]);

export const workflowBlocks = pgTable("workflow_blocks", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	type: text().notNull(),
	name: text().notNull(),
	positionX: numeric("position_x").notNull(),
	positionY: numeric("position_y").notNull(),
	enabled: boolean().default(true).notNull(),
	horizontalHandles: boolean("horizontal_handles").default(true).notNull(),
	isWide: boolean("is_wide").default(false).notNull(),
	height: numeric().default('0').notNull(),
	subBlocks: jsonb("sub_blocks").default({}).notNull(),
	outputs: jsonb().default({}).notNull(),
	data: jsonb().default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	advancedMode: boolean("advanced_mode").default(false).notNull(),
	triggerMode: boolean("trigger_mode").default(false).notNull(),
}, (table) => [
	index("workflow_blocks_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("workflow_blocks_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_blocks_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
]);

export const copilotChats = pgTable("copilot_chats", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	workflowId: text("workflow_id").notNull(),
	title: text(),
	messages: jsonb().default([]).notNull(),
	model: text().default('claude-3-7-sonnet-latest').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	previewYaml: text("preview_yaml"),
	conversationId: text("conversation_id"),
	planArtifact: text("plan_artifact"),
	config: jsonb(),
}, (table) => [
	index("copilot_chats_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("copilot_chats_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamp_ops")),
	index("copilot_chats_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("copilot_chats_user_workflow_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.workflowId.asc().nullsLast().op("text_ops")),
	index("copilot_chats_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "copilot_chats_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "copilot_chats_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
]);

export const workflowExecutionLogs = pgTable("workflow_execution_logs", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	executionId: text("execution_id").notNull(),
	stateSnapshotId: text("state_snapshot_id").notNull(),
	level: text().notNull(),
	trigger: text().notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).notNull(),
	endedAt: timestamp("ended_at", { mode: 'string' }),
	totalDurationMs: integer("total_duration_ms"),
	executionData: jsonb("execution_data").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	files: jsonb(),
	cost: jsonb(),
	deploymentVersionId: text("deployment_version_id"),
	workspaceId: text("workspace_id").notNull(),
	status: text().default('running').notNull(),
}, (table) => [
	index("workflow_execution_logs_deployment_version_id_idx").using("btree", table.deploymentVersionId.asc().nullsLast().op("text_ops")),
	uniqueIndex("workflow_execution_logs_execution_id_unique").using("btree", table.executionId.asc().nullsLast().op("text_ops")),
	index("workflow_execution_logs_level_idx").using("btree", table.level.asc().nullsLast().op("text_ops")),
	index("workflow_execution_logs_started_at_idx").using("btree", table.startedAt.asc().nullsLast().op("timestamp_ops")),
	index("workflow_execution_logs_state_snapshot_id_idx").using("btree", table.stateSnapshotId.asc().nullsLast().op("text_ops")),
	index("workflow_execution_logs_trigger_idx").using("btree", table.trigger.asc().nullsLast().op("text_ops")),
	index("workflow_execution_logs_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	index("workflow_execution_logs_workflow_started_at_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.startedAt.asc().nullsLast().op("text_ops")),
	index("workflow_execution_logs_workspace_started_at_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.startedAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_execution_logs_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.stateSnapshotId],
			foreignColumns: [workflowExecutionSnapshots.id],
			name: "workflow_execution_logs_state_snapshot_id_workflow_execution_sn"
		}),
	foreignKey({
			columns: [table.deploymentVersionId],
			foreignColumns: [workflowDeploymentVersion.id],
			name: "workflow_execution_logs_deployment_version_id_workflow_deployme"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workflow_execution_logs_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
]);

export const subscription = pgTable("subscription", {
	id: text().primaryKey().notNull(),
	plan: text().notNull(),
	referenceId: text("reference_id").notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	status: text(),
	periodStart: timestamp("period_start", { mode: 'string' }),
	periodEnd: timestamp("period_end", { mode: 'string' }),
	cancelAtPeriodEnd: boolean("cancel_at_period_end"),
	seats: integer(),
	trialStart: timestamp("trial_start", { mode: 'string' }),
	trialEnd: timestamp("trial_end", { mode: 'string' }),
	metadata: json(),
}, (table) => [
	index("subscription_reference_status_idx").using("btree", table.referenceId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	check("check_enterprise_metadata", sql`(plan <> 'enterprise'::text) OR (metadata IS NOT NULL)`),
]);

export const workspaceEnvironment = pgTable("workspace_environment", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	variables: json().default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("workspace_environment_workspace_unique").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_environment_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
]);

export const workspaceInvitation = pgTable("workspace_invitation", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	email: text().notNull(),
	inviterId: text("inviter_id").notNull(),
	role: text().default('member').notNull(),
	status: workspaceInvitationStatus().default('pending').notNull(),
	token: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	permissions: permissionType().default('admin').notNull(),
	orgInvitationId: text("org_invitation_id"),
}, (table) => [
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_invitation_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.inviterId],
			foreignColumns: [user.id],
			name: "workspace_invitation_inviter_id_user_id_fk"
		}).onDelete("cascade"),
	unique("workspace_invitation_token_unique").on(table.token),
]);

export const mcpServers = pgTable("mcp_servers", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	createdBy: text("created_by"),
	name: text().notNull(),
	description: text(),
	transport: text().notNull(),
	url: text(),
	headers: json().default({}),
	timeout: integer().default(30000),
	retries: integer().default(3),
	enabled: boolean().default(true).notNull(),
	lastConnected: timestamp("last_connected", { mode: 'string' }),
	connectionStatus: text("connection_status").default('disconnected'),
	lastError: text("last_error"),
	toolCount: integer("tool_count").default(0),
	lastToolsRefresh: timestamp("last_tools_refresh", { mode: 'string' }),
	totalRequests: integer("total_requests").default(0),
	lastUsed: timestamp("last_used", { mode: 'string' }),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	statusConfig: jsonb("status_config").default({}),
}, (table) => [
	index("mcp_servers_workspace_deleted_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.deletedAt.asc().nullsLast().op("timestamp_ops")),
	index("mcp_servers_workspace_enabled_idx").using("btree", table.workspaceId.asc().nullsLast().op("bool_ops"), table.enabled.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "mcp_servers_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "mcp_servers_created_by_user_id_fk"
		}).onDelete("set null"),
]);

export const workflow = pgTable("workflow", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	description: text(),
	lastSynced: timestamp("last_synced", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	isDeployed: boolean("is_deployed").default(false).notNull(),
	deployedAt: timestamp("deployed_at", { mode: 'string' }),
	color: text().default('#3972F6').notNull(),
	runCount: integer("run_count").default(0).notNull(),
	lastRunAt: timestamp("last_run_at", { mode: 'string' }),
	variables: json().default({}),
	workspaceId: text("workspace_id"),
	folderId: text("folder_id"),
}, (table) => [
	index("workflow_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("workflow_user_workspace_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.workspaceId.asc().nullsLast().op("text_ops")),
	index("workflow_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "workflow_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workflow_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.folderId],
			foreignColumns: [workflowFolder.id],
			name: "workflow_folder_id_workflow_folder_id_fk"
		}).onDelete("set null"),
]);

export const apiKey = pgTable("api_key", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	key: text().notNull(),
	lastUsed: timestamp("last_used", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	workspaceId: text("workspace_id"),
	createdBy: text("created_by"),
	type: text().default('personal').notNull(),
}, (table) => [
	index("api_key_user_type_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
	index("api_key_workspace_type_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "api_key_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "api_key_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "api_key_created_by_user_id_fk"
		}).onDelete("set null"),
	unique("api_key_key_unique").on(table.key),
	check("workspace_type_check", sql`((type = 'workspace'::text) AND (workspace_id IS NOT NULL)) OR ((type = 'personal'::text) AND (workspace_id IS NULL))`),
]);

export const idempotencyKey = pgTable("idempotency_key", {
	key: text().notNull(),
	namespace: text().default('default').notNull(),
	result: json().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idempotency_key_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idempotency_key_namespace_idx").using("btree", table.namespace.asc().nullsLast().op("text_ops")),
	uniqueIndex("idempotency_key_namespace_unique").using("btree", table.key.asc().nullsLast().op("text_ops"), table.namespace.asc().nullsLast().op("text_ops")),
]);

export const ssoProvider = pgTable("sso_provider", {
	id: text().primaryKey().notNull(),
	issuer: text().notNull(),
	domain: text().notNull(),
	oidcConfig: text("oidc_config"),
	samlConfig: text("saml_config"),
	userId: text("user_id").notNull(),
	providerId: text("provider_id").notNull(),
	organizationId: text("organization_id"),
}, (table) => [
	index("sso_provider_domain_idx").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("sso_provider_organization_id_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops")),
	index("sso_provider_provider_id_idx").using("btree", table.providerId.asc().nullsLast().op("text_ops")),
	index("sso_provider_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "sso_provider_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "sso_provider_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const workflowDeploymentVersion = pgTable("workflow_deployment_version", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	version: integer().notNull(),
	state: json().notNull(),
	isActive: boolean("is_active").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	createdBy: text("created_by"),
	name: text(),
}, (table) => [
	index("workflow_deployment_version_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("workflow_deployment_version_workflow_active_idx").using("btree", table.workflowId.asc().nullsLast().op("bool_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	uniqueIndex("workflow_deployment_version_workflow_version_unique").using("btree", table.workflowId.asc().nullsLast().op("int4_ops"), table.version.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_deployment_version_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
]);

export const workspaceFile = pgTable("workspace_file", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	name: text().notNull(),
	key: text().notNull(),
	size: integer().notNull(),
	type: text().notNull(),
	uploadedBy: text("uploaded_by").notNull(),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_file_key_idx").using("btree", table.key.asc().nullsLast().op("text_ops")),
	index("workspace_file_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_file_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [user.id],
			name: "workspace_file_uploaded_by_user_id_fk"
		}).onDelete("cascade"),
	unique("workspace_file_key_unique").on(table.key),
]);

export const organization = pgTable("organization", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	logo: text(),
	metadata: json(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	orgUsageLimit: numeric("org_usage_limit"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).default(0).notNull(),
	departedMemberUsage: numeric("departed_member_usage").default('0').notNull(),
	creditBalance: numeric("credit_balance").default('0').notNull(),
});

export const workspace = pgTable("workspace", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	ownerId: text("owner_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	billedAccountUserId: text("billed_account_user_id").notNull(),
	allowPersonalApiKeys: boolean("allow_personal_api_keys").default(true).notNull(),
	isGlobal: boolean("is_global").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [user.id],
			name: "workspace_owner_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.billedAccountUserId],
			foreignColumns: [user.id],
			name: "workspace_billed_account_user_id_user_id_fk"
		}),
]);

export const workspaceFiles = pgTable("workspace_files", {
	id: text().primaryKey().notNull(),
	key: text().notNull(),
	userId: text("user_id").notNull(),
	workspaceId: text("workspace_id"),
	context: text().notNull(),
	originalName: text("original_name").notNull(),
	contentType: text("content_type").notNull(),
	size: integer().notNull(),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workspace_files_context_idx").using("btree", table.context.asc().nullsLast().op("text_ops")),
	index("workspace_files_key_idx").using("btree", table.key.asc().nullsLast().op("text_ops")),
	index("workspace_files_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("workspace_files_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "workspace_files_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_files_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	unique("workspace_files_key_unique").on(table.key),
]);

export const userStats = pgTable("user_stats", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	totalManualExecutions: integer("total_manual_executions").default(0).notNull(),
	totalApiCalls: integer("total_api_calls").default(0).notNull(),
	totalWebhookTriggers: integer("total_webhook_triggers").default(0).notNull(),
	totalScheduledExecutions: integer("total_scheduled_executions").default(0).notNull(),
	totalTokensUsed: integer("total_tokens_used").default(0).notNull(),
	totalCost: numeric("total_cost").default('0').notNull(),
	lastActive: timestamp("last_active", { mode: 'string' }).defaultNow().notNull(),
	totalChatExecutions: integer("total_chat_executions").default(0).notNull(),
	currentUsageLimit: numeric("current_usage_limit").default('20'),
	usageLimitUpdatedAt: timestamp("usage_limit_updated_at", { mode: 'string' }).defaultNow(),
	currentPeriodCost: numeric("current_period_cost").default('0').notNull(),
	lastPeriodCost: numeric("last_period_cost").default('0'),
	totalCopilotCost: numeric("total_copilot_cost").default('0').notNull(),
	totalCopilotTokens: integer("total_copilot_tokens").default(0).notNull(),
	totalCopilotCalls: integer("total_copilot_calls").default(0).notNull(),
	billingBlocked: boolean("billing_blocked").default(false),
	proPeriodCostSnapshot: numeric("pro_period_cost_snapshot").default('0'),
	billedOverageThisPeriod: numeric("billed_overage_this_period").default('0').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).default(0).notNull(),
	currentPeriodCopilotCost: numeric("current_period_copilot_cost").default('0').notNull(),
	lastPeriodCopilotCost: numeric("last_period_copilot_cost").default('0'),
	creditBalance: numeric("credit_balance").default('0').notNull(),
	billingBlockedReason: billingBlockedReason("billing_blocked_reason"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_stats_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("user_stats_user_id_unique").on(table.userId),
]);

export const customTools = pgTable("custom_tools", {
	id: text().primaryKey().notNull(),
	userId: text("user_id"),
	title: text().notNull(),
	schema: json().notNull(),
	code: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	workspaceId: text("workspace_id"),
}, (table) => [
	index("custom_tools_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	uniqueIndex("custom_tools_workspace_title_unique").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.title.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "custom_tools_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "custom_tools_user_id_user_id_fk"
		}).onDelete("set null"),
]);

export const pausedExecutions = pgTable("paused_executions", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	executionId: text("execution_id").notNull(),
	executionSnapshot: jsonb("execution_snapshot").notNull(),
	pausePoints: jsonb("pause_points").notNull(),
	totalPauseCount: integer("total_pause_count").notNull(),
	resumedCount: integer("resumed_count").default(0).notNull(),
	status: text().default('paused').notNull(),
	metadata: jsonb().default({}).notNull(),
	pausedAt: timestamp("paused_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
}, (table) => [
	uniqueIndex("paused_executions_execution_id_unique").using("btree", table.executionId.asc().nullsLast().op("text_ops")),
	index("paused_executions_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("paused_executions_workflow_id_idx").using("btree", table.workflowId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "paused_executions_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
]);

export const resumeQueue = pgTable("resume_queue", {
	id: text().primaryKey().notNull(),
	pausedExecutionId: text("paused_execution_id").notNull(),
	parentExecutionId: text("parent_execution_id").notNull(),
	newExecutionId: text("new_execution_id").notNull(),
	contextId: text("context_id").notNull(),
	resumeInput: jsonb("resume_input"),
	status: text().default('pending').notNull(),
	queuedAt: timestamp("queued_at", { mode: 'string' }).defaultNow().notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	failureReason: text("failure_reason"),
}, (table) => [
	index("resume_queue_new_execution_idx").using("btree", table.newExecutionId.asc().nullsLast().op("text_ops")),
	index("resume_queue_parent_status_idx").using("btree", table.parentExecutionId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("timestamp_ops"), table.queuedAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.pausedExecutionId],
			foreignColumns: [pausedExecutions.id],
			name: "resume_queue_paused_execution_id_paused_executions_id_fk"
		}).onDelete("cascade"),
]);

export const templateCreators = pgTable("template_creators", {
	id: text().primaryKey().notNull(),
	referenceType: templateCreatorType("reference_type").notNull(),
	referenceId: text("reference_id").notNull(),
	name: text().notNull(),
	profileImageUrl: text("profile_image_url"),
	details: jsonb(),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	verified: boolean().default(false).notNull(),
}, (table) => [
	index("template_creators_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
	index("template_creators_reference_id_idx").using("btree", table.referenceId.asc().nullsLast().op("text_ops")),
	uniqueIndex("template_creators_reference_idx").using("btree", table.referenceType.asc().nullsLast().op("enum_ops"), table.referenceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "template_creators_created_by_user_id_fk"
		}).onDelete("set null"),
]);

export const templates = pgTable("templates", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id"),
	name: text().notNull(),
	views: integer().default(0).notNull(),
	stars: integer().default(0).notNull(),
	state: jsonb().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	details: jsonb(),
	creatorId: text("creator_id"),
	status: templateStatus().default('pending').notNull(),
	tags: text().array().default([""]).notNull(),
	requiredCredentials: jsonb("required_credentials").default([]).notNull(),
	ogImageUrl: text("og_image_url"),
}, (table) => [
	index("templates_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("templates_creator_id_idx").using("btree", table.creatorId.asc().nullsLast().op("text_ops")),
	index("templates_stars_idx").using("btree", table.stars.asc().nullsLast().op("int4_ops")),
	index("templates_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	index("templates_status_stars_idx").using("btree", table.status.asc().nullsLast().op("int4_ops"), table.stars.asc().nullsLast().op("enum_ops")),
	index("templates_status_views_idx").using("btree", table.status.asc().nullsLast().op("int4_ops"), table.views.asc().nullsLast().op("int4_ops")),
	index("templates_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamp_ops")),
	index("templates_views_idx").using("btree", table.views.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.creatorId],
			foreignColumns: [templateCreators.id],
			name: "templates_creator_id_template_creators_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "templates_workflow_id_workflow_id_fk"
		}).onDelete("set null"),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	isSuperUser: boolean("is_super_user").default(false).notNull(),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const workflowSchedule = pgTable("workflow_schedule", {
	id: text().primaryKey().notNull(),
	workflowId: text("workflow_id").notNull(),
	cronExpression: text("cron_expression"),
	nextRunAt: timestamp("next_run_at", { mode: 'string' }),
	lastRanAt: timestamp("last_ran_at", { mode: 'string' }),
	triggerType: text("trigger_type").notNull(),
	timezone: text().default('UTC').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	failedCount: integer("failed_count").default(0).notNull(),
	status: text().default('active').notNull(),
	lastFailedAt: timestamp("last_failed_at", { mode: 'string' }),
	blockId: text("block_id"),
	lastQueuedAt: timestamp("last_queued_at", { mode: 'string' }),
}, (table) => [
	uniqueIndex("workflow_schedule_workflow_block_unique").using("btree", table.workflowId.asc().nullsLast().op("text_ops"), table.blockId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workflowId],
			foreignColumns: [workflow.id],
			name: "workflow_schedule_workflow_id_workflow_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.blockId],
			foreignColumns: [workflowBlocks.id],
			name: "workflow_schedule_block_id_workflow_blocks_id_fk"
		}).onDelete("cascade"),
]);

export const settings = pgTable("settings", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	theme: text().default('system').notNull(),
	autoConnect: boolean("auto_connect").default(true).notNull(),
	telemetryEnabled: boolean("telemetry_enabled").default(true).notNull(),
	emailPreferences: json("email_preferences").default({}).notNull(),
	billingUsageNotificationsEnabled: boolean("billing_usage_notifications_enabled").default(true).notNull(),
	showTrainingControls: boolean("show_training_controls").default(false).notNull(),
	copilotEnabledModels: jsonb("copilot_enabled_models").default({}).notNull(),
	superUserModeEnabled: boolean("super_user_mode_enabled").default(true).notNull(),
	errorNotificationsEnabled: boolean("error_notifications_enabled").default(true).notNull(),
	copilotAutoAllowedTools: jsonb("copilot_auto_allowed_tools").default([]).notNull(),
	snapToGridSize: integer("snap_to_grid_size").default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "settings_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("settings_user_id_unique").on(table.userId),
]);
