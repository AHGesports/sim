-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."billing_blocked_reason" AS ENUM('payment_failed', 'dispute');--> statement-breakpoint
CREATE TYPE "public"."browser_profile_provider_type" AS ENUM('own_browser', 'more_login');--> statement-breakpoint
CREATE TYPE "public"."db_budget_tier" AS ENUM('free', 'paid', 'enterprise', 'custom');--> statement-breakpoint
CREATE TYPE "public"."db_ownership_type" AS ENUM('platform', 'user');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'in_progress', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('webhook', 'email', 'slack');--> statement-breakpoint
CREATE TYPE "public"."permission_type" AS ENUM('admin', 'write', 'read');--> statement-breakpoint
CREATE TYPE "public"."profile_scope" AS ENUM('global', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."template_creator_type" AS ENUM('user', 'organization');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."usage_log_category" AS ENUM('model', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."usage_log_source" AS ENUM('workflow', 'wand', 'copilot');--> statement-breakpoint
CREATE TYPE "public"."workspace_invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace_notification_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"notification_type" "notification_type" NOT NULL,
	"workflow_ids" text[] DEFAULT '{""}' NOT NULL,
	"all_workflows" boolean DEFAULT false NOT NULL,
	"level_filter" text[] DEFAULT '{"RAY['info'::text","'error'::tex"}' NOT NULL,
	"trigger_filter" text[] DEFAULT '{"RAY['api'::text","'webhook'::text","'schedule'::text","'manual'::text","'chat'::tex"}' NOT NULL,
	"include_final_output" boolean DEFAULT false NOT NULL,
	"include_trace_spans" boolean DEFAULT false NOT NULL,
	"include_rate_limits" boolean DEFAULT false NOT NULL,
	"include_usage_data" boolean DEFAULT false NOT NULL,
	"webhook_config" jsonb,
	"email_recipients" text[],
	"slack_config" jsonb,
	"alert_config" jsonb,
	"last_alert_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_notification_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"execution_id" text NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"next_attempt_at" timestamp,
	"response_status" integer,
	"response_body" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"tokens" numeric NOT NULL,
	"last_refill_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"filename" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"character_count" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"tag1" text,
	"tag2" text,
	"tag3" text,
	"tag4" text,
	"tag5" text,
	"tag6" text,
	"tag7" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processing_started_at" timestamp,
	"processing_completed_at" timestamp,
	"processing_error" text,
	"number1" double precision,
	"number2" double precision,
	"number3" double precision,
	"number4" double precision,
	"number5" double precision,
	"date1" timestamp,
	"date2" timestamp,
	"boolean1" boolean,
	"boolean2" boolean,
	"boolean3" boolean
);
--> statement-breakpoint
CREATE TABLE "environment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"variables" json NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "environment_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" "usage_log_category" NOT NULL,
	"source" "usage_log_source" NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"cost" numeric NOT NULL,
	"workspace_id" text,
	"workflow_id" text,
	"execution_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_byok_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"scope" "profile_scope" NOT NULL,
	"browser_profile_id" text,
	"name" text NOT NULL,
	"profile_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scope_workspace_check" CHECK (((scope = 'global'::profile_scope) AND (workspace_id IS NULL)) OR ((scope = 'workspace'::profile_scope) AND (workspace_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "browser_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_type" "browser_profile_provider_type" NOT NULL,
	"provider_config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"user_id" text NOT NULL,
	"identifier" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"customizations" json DEFAULT '{}'::json,
	"auth_type" text DEFAULT 'public' NOT NULL,
	"password" text,
	"allowed_emails" json DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"output_configs" json DEFAULT '[]'::json
);
--> statement-breakpoint
CREATE TABLE "user_db_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"budget_tier" "db_budget_tier" DEFAULT 'free' NOT NULL,
	"custom_budget_cents" integer,
	"budget_exceeded" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp DEFAULT now() NOT NULL,
	"total_cost_cents" integer DEFAULT 0 NOT NULL,
	"last_sync" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_db_budget_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_global_database" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ownership_type" "db_ownership_type" DEFAULT 'platform' NOT NULL,
	"neon_project_id" text,
	"neon_branch_id" text,
	"neon_connection_uri" text,
	"database_name" text DEFAULT 'neondb' NOT NULL,
	"current_period_cost_cents" integer DEFAULT 0 NOT NULL,
	"last_consumption_sync" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_global_database_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_database" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"ownership_type" "db_ownership_type" DEFAULT 'platform' NOT NULL,
	"neon_project_id" text,
	"neon_branch_id" text,
	"neon_connection_uri" text,
	"database_name" text DEFAULT 'neondb' NOT NULL,
	"current_period_cost_cents" integer DEFAULT 0 NOT NULL,
	"last_consumption_sync" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "workspace_database_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "memory" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"workspace_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"description" text,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"embedding_dimension" integer DEFAULT 1536 NOT NULL,
	"chunking_config" json DEFAULT '{"maxSize":1024,"minSize":1,"overlap":200}'::json NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"parent_id" text,
	"color" text DEFAULT '#6B7280',
	"is_expanded" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"source_block_id" text NOT NULL,
	"target_block_id" text NOT NULL,
	"source_handle" text,
	"target_handle" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_subflows" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"permission_type" "permission_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_execution_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"state_hash" text NOT NULL,
	"state_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "docs_embeddings" (
	"chunk_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_text" text NOT NULL,
	"source_document" text NOT NULL,
	"source_link" text NOT NULL,
	"header_text" text NOT NULL,
	"header_level" integer NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chunk_text_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, chunk_text)) STORED,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "docs_embedding_not_null_check" CHECK (embedding IS NOT NULL),
	CONSTRAINT "docs_header_level_check" CHECK ((header_level >= 1) AND (header_level <= 6))
);
--> statement-breakpoint
CREATE TABLE "embedding" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"document_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_hash" text NOT NULL,
	"content" text NOT NULL,
	"content_length" integer NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
	"enabled" boolean DEFAULT true NOT NULL,
	"tag1" text,
	"tag2" text,
	"tag3" text,
	"tag4" text,
	"tag5" text,
	"tag6" text,
	"tag7" text,
	"number1" double precision,
	"number2" double precision,
	"number3" double precision,
	"number4" double precision,
	"number5" double precision,
	"date1" timestamp,
	"date2" timestamp,
	"boolean1" boolean,
	"boolean2" boolean,
	"boolean3" boolean,
	CONSTRAINT "embedding_not_null_check" CHECK (embedding IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "template_stars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"template_id" text NOT NULL,
	"starred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"path" text NOT NULL,
	"provider" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"provider_config" json,
	"block_id" text,
	"failed_count" integer DEFAULT 0,
	"last_failed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_tag_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"tag_slot" text NOT NULL,
	"display_name" text NOT NULL,
	"field_type" text DEFAULT 'text' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"chat_id" uuid NOT NULL,
	"message_id" text,
	"workflow_state" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_feedback" (
	"feedback_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_query" text NOT NULL,
	"agent_response" text NOT NULL,
	"is_positive" boolean NOT NULL,
	"feedback" text,
	"workflow_yaml" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"position_x" numeric NOT NULL,
	"position_y" numeric NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"horizontal_handles" boolean DEFAULT true NOT NULL,
	"is_wide" boolean DEFAULT false NOT NULL,
	"height" numeric DEFAULT '0' NOT NULL,
	"sub_blocks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"advanced_mode" boolean DEFAULT false NOT NULL,
	"trigger_mode" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"title" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text DEFAULT 'claude-3-7-sonnet-latest' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"preview_yaml" text,
	"conversation_id" text,
	"plan_artifact" text,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE "workflow_execution_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"execution_id" text NOT NULL,
	"state_snapshot_id" text NOT NULL,
	"level" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"total_duration_ms" integer,
	"execution_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"files" jsonb,
	"cost" jsonb,
	"deployment_version_id" text,
	"workspace_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean,
	"seats" integer,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"metadata" json,
	CONSTRAINT "check_enterprise_metadata" CHECK ((plan <> 'enterprise'::text) OR (metadata IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "workspace_environment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"variables" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" "workspace_invitation_status" DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"permissions" "permission_type" DEFAULT 'admin' NOT NULL,
	"org_invitation_id" text,
	CONSTRAINT "workspace_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text,
	"name" text NOT NULL,
	"description" text,
	"transport" text NOT NULL,
	"url" text,
	"headers" json DEFAULT '{}'::json,
	"timeout" integer DEFAULT 30000,
	"retries" integer DEFAULT 3,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_connected" timestamp,
	"connection_status" text DEFAULT 'disconnected',
	"last_error" text,
	"tool_count" integer DEFAULT 0,
	"last_tools_refresh" timestamp,
	"total_requests" integer DEFAULT 0,
	"last_used" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"status_config" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"last_synced" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"is_deployed" boolean DEFAULT false NOT NULL,
	"deployed_at" timestamp,
	"color" text DEFAULT '#3972F6' NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp,
	"variables" json DEFAULT '{}'::json,
	"workspace_id" text,
	"folder_id" text
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"workspace_id" text,
	"created_by" text,
	"type" text DEFAULT 'personal' NOT NULL,
	CONSTRAINT "api_key_key_unique" UNIQUE("key"),
	CONSTRAINT "workspace_type_check" CHECK (((type = 'workspace'::text) AND (workspace_id IS NOT NULL)) OR ((type = 'personal'::text) AND (workspace_id IS NULL)))
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"key" text NOT NULL,
	"namespace" text DEFAULT 'default' NOT NULL,
	"result" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"domain" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text
);
--> statement-breakpoint
CREATE TABLE "workflow_deployment_version" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"version" integer NOT NULL,
	"state" json NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "workspace_file" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"size" integer NOT NULL,
	"type" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_file_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"org_usage_limit" numeric,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"departed_member_usage" numeric DEFAULT '0' NOT NULL,
	"credit_balance" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"billed_account_user_id" text NOT NULL,
	"allow_personal_api_keys" boolean DEFAULT true NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_files" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"context" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"total_manual_executions" integer DEFAULT 0 NOT NULL,
	"total_api_calls" integer DEFAULT 0 NOT NULL,
	"total_webhook_triggers" integer DEFAULT 0 NOT NULL,
	"total_scheduled_executions" integer DEFAULT 0 NOT NULL,
	"total_tokens_used" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric DEFAULT '0' NOT NULL,
	"last_active" timestamp DEFAULT now() NOT NULL,
	"total_chat_executions" integer DEFAULT 0 NOT NULL,
	"current_usage_limit" numeric DEFAULT '20',
	"usage_limit_updated_at" timestamp DEFAULT now(),
	"current_period_cost" numeric DEFAULT '0' NOT NULL,
	"last_period_cost" numeric DEFAULT '0',
	"total_copilot_cost" numeric DEFAULT '0' NOT NULL,
	"total_copilot_tokens" integer DEFAULT 0 NOT NULL,
	"total_copilot_calls" integer DEFAULT 0 NOT NULL,
	"billing_blocked" boolean DEFAULT false,
	"pro_period_cost_snapshot" numeric DEFAULT '0',
	"billed_overage_this_period" numeric DEFAULT '0' NOT NULL,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"current_period_copilot_cost" numeric DEFAULT '0' NOT NULL,
	"last_period_copilot_cost" numeric DEFAULT '0',
	"credit_balance" numeric DEFAULT '0' NOT NULL,
	"billing_blocked_reason" "billing_blocked_reason",
	CONSTRAINT "user_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "custom_tools" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text NOT NULL,
	"schema" json NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"workspace_id" text
);
--> statement-breakpoint
CREATE TABLE "paused_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"execution_id" text NOT NULL,
	"execution_snapshot" jsonb NOT NULL,
	"pause_points" jsonb NOT NULL,
	"total_pause_count" integer NOT NULL,
	"resumed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'paused' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paused_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "resume_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"paused_execution_id" text NOT NULL,
	"parent_execution_id" text NOT NULL,
	"new_execution_id" text NOT NULL,
	"context_id" text NOT NULL,
	"resume_input" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"completed_at" timestamp,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "template_creators" (
	"id" text PRIMARY KEY NOT NULL,
	"reference_type" "template_creator_type" NOT NULL,
	"reference_id" text NOT NULL,
	"name" text NOT NULL,
	"profile_image_url" text,
	"details" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text,
	"name" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"details" jsonb,
	"creator_id" text,
	"status" "template_status" DEFAULT 'pending' NOT NULL,
	"tags" text[] DEFAULT '{""}' NOT NULL,
	"required_credentials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"og_image_url" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"stripe_customer_id" text,
	"is_super_user" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workflow_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"cron_expression" text,
	"next_run_at" timestamp,
	"last_ran_at" timestamp,
	"trigger_type" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_failed_at" timestamp,
	"block_id" text,
	"last_queued_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"auto_connect" boolean DEFAULT true NOT NULL,
	"telemetry_enabled" boolean DEFAULT true NOT NULL,
	"email_preferences" json DEFAULT '{}'::json NOT NULL,
	"billing_usage_notifications_enabled" boolean DEFAULT true NOT NULL,
	"show_training_controls" boolean DEFAULT false NOT NULL,
	"copilot_enabled_models" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"super_user_mode_enabled" boolean DEFAULT true NOT NULL,
	"error_notifications_enabled" boolean DEFAULT true NOT NULL,
	"copilot_auto_allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snap_to_grid_size" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notification_subscription" ADD CONSTRAINT "workspace_notification_subscription_workspace_id_workspace_id_f" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notification_subscription" ADD CONSTRAINT "workspace_notification_subscription_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notification_delivery" ADD CONSTRAINT "workspace_notification_delivery_subscription_id_workspace_notif" FOREIGN KEY ("subscription_id") REFERENCES "public"."workspace_notification_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notification_delivery" ADD CONSTRAINT "workspace_notification_delivery_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_byok_keys" ADD CONSTRAINT "workspace_byok_keys_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_byok_keys" ADD CONSTRAINT "workspace_byok_keys_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profile" ADD CONSTRAINT "agent_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profile" ADD CONSTRAINT "agent_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profile" ADD CONSTRAINT "agent_profile_browser_profile_id_browser_profile_id_fk" FOREIGN KEY ("browser_profile_id") REFERENCES "public"."browser_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_profile" ADD CONSTRAINT "browser_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_db_budget" ADD CONSTRAINT "user_db_budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_global_database" ADD CONSTRAINT "user_global_database_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_database" ADD CONSTRAINT "workspace_database_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_folder" ADD CONSTRAINT "workflow_folder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_folder" ADD CONSTRAINT "workflow_folder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_folder" ADD CONSTRAINT "workflow_folder_parent_id_workflow_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."workflow_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_source_block_id_workflow_blocks_id_fk" FOREIGN KEY ("source_block_id") REFERENCES "public"."workflow_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_target_block_id_workflow_blocks_id_fk" FOREIGN KEY ("target_block_id") REFERENCES "public"."workflow_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_subflows" ADD CONSTRAINT "workflow_subflows_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_snapshots" ADD CONSTRAINT "workflow_execution_snapshots_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_knowledge_base_id_knowledge_base_id_fk" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding" ADD CONSTRAINT "embedding_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_stars" ADD CONSTRAINT "template_stars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_stars" ADD CONSTRAINT "template_stars_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_block_id_workflow_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."workflow_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_tag_definitions" ADD CONSTRAINT "knowledge_base_tag_definitions_knowledge_base_id_knowledge_base" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_checkpoints" ADD CONSTRAINT "workflow_checkpoints_chat_id_copilot_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."copilot_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_feedback" ADD CONSTRAINT "copilot_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_feedback" ADD CONSTRAINT "copilot_feedback_chat_id_copilot_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."copilot_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_blocks" ADD CONSTRAINT "workflow_blocks_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD CONSTRAINT "copilot_chats_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_state_snapshot_id_workflow_execution_sn" FOREIGN KEY ("state_snapshot_id") REFERENCES "public"."workflow_execution_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_deployment_version_id_workflow_deployme" FOREIGN KEY ("deployment_version_id") REFERENCES "public"."workflow_deployment_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_environment" ADD CONSTRAINT "workspace_environment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_folder_id_workflow_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."workflow_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployment_version" ADD CONSTRAINT "workflow_deployment_version_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file" ADD CONSTRAINT "workspace_file_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file" ADD CONSTRAINT "workspace_file_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_billed_account_user_id_user_id_fk" FOREIGN KEY ("billed_account_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tools" ADD CONSTRAINT "custom_tools_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tools" ADD CONSTRAINT "custom_tools_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paused_executions" ADD CONSTRAINT "paused_executions_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_queue" ADD CONSTRAINT "resume_queue_paused_execution_id_paused_executions_id_fk" FOREIGN KEY ("paused_execution_id") REFERENCES "public"."paused_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_creators" ADD CONSTRAINT "template_creators_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_creator_id_template_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."template_creators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule" ADD CONSTRAINT "workflow_schedule_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_schedule" ADD CONSTRAINT "workflow_schedule_block_id_workflow_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."workflow_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier" text_ops);--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "account_user_provider_account_unique" ON "account" USING btree ("user_id" text_ops,"provider_id" text_ops,"account_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_account_on_account_id_provider_id" ON "account" USING btree ("account_id" text_ops,"provider_id" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_notification_active_idx" ON "workspace_notification_subscription" USING btree ("active" bool_ops);--> statement-breakpoint
CREATE INDEX "workspace_notification_type_idx" ON "workspace_notification_subscription" USING btree ("notification_type" enum_ops);--> statement-breakpoint
CREATE INDEX "workspace_notification_workspace_id_idx" ON "workspace_notification_subscription" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_notification_delivery_execution_id_idx" ON "workspace_notification_delivery" USING btree ("execution_id" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_notification_delivery_next_attempt_idx" ON "workspace_notification_delivery" USING btree ("next_attempt_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "workspace_notification_delivery_status_idx" ON "workspace_notification_delivery" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "workspace_notification_delivery_subscription_id_idx" ON "workspace_notification_delivery" USING btree ("subscription_id" text_ops);--> statement-breakpoint
CREATE INDEX "doc_boolean1_idx" ON "document" USING btree ("boolean1" bool_ops);--> statement-breakpoint
CREATE INDEX "doc_boolean2_idx" ON "document" USING btree ("boolean2" bool_ops);--> statement-breakpoint
CREATE INDEX "doc_boolean3_idx" ON "document" USING btree ("boolean3" bool_ops);--> statement-breakpoint
CREATE INDEX "doc_date1_idx" ON "document" USING btree ("date1" timestamp_ops);--> statement-breakpoint
CREATE INDEX "doc_date2_idx" ON "document" USING btree ("date2" timestamp_ops);--> statement-breakpoint
CREATE INDEX "doc_filename_idx" ON "document" USING btree ("filename" text_ops);--> statement-breakpoint
CREATE INDEX "doc_kb_id_idx" ON "document" USING btree ("knowledge_base_id" text_ops);--> statement-breakpoint
CREATE INDEX "doc_number1_idx" ON "document" USING btree ("number1" float8_ops);--> statement-breakpoint
CREATE INDEX "doc_number2_idx" ON "document" USING btree ("number2" float8_ops);--> statement-breakpoint
CREATE INDEX "doc_number3_idx" ON "document" USING btree ("number3" float8_ops);--> statement-breakpoint
CREATE INDEX "doc_number4_idx" ON "document" USING btree ("number4" float8_ops);--> statement-breakpoint
CREATE INDEX "doc_number5_idx" ON "document" USING btree ("number5" float8_ops);--> statement-breakpoint
CREATE INDEX "doc_processing_status_idx" ON "document" USING btree ("knowledge_base_id" text_ops,"processing_status" text_ops);--> statement-breakpoint
CREATE INDEX "doc_tag1_idx" ON "document" USING btree ("tag1" text_ops);--> statement-breakpoint
CREATE INDEX "doc_tag2_idx" ON "document" USING btree ("tag2" text_ops);--> statement-breakpoint
CREATE INDEX "doc_tag3_idx" ON "document" USING btree ("tag3" text_ops);--> statement-breakpoint
CREATE INDEX "doc_tag4_idx" ON "document" USING btree ("tag4" text_ops);--> statement-breakpoint
CREATE INDEX "doc_tag5_idx" ON "document" USING btree ("tag5" text_ops);--> statement-breakpoint
CREATE INDEX "doc_tag6_idx" ON "document" USING btree ("tag6" text_ops);--> statement-breakpoint
CREATE INDEX "doc_tag7_idx" ON "document" USING btree ("tag7" text_ops);--> statement-breakpoint
CREATE INDEX "usage_log_source_idx" ON "usage_log" USING btree ("source" enum_ops);--> statement-breakpoint
CREATE INDEX "usage_log_user_created_at_idx" ON "usage_log" USING btree ("user_id" timestamp_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "usage_log_workflow_id_idx" ON "usage_log" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "usage_log_workspace_id_idx" ON "usage_log" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_byok_provider_unique" ON "workspace_byok_keys" USING btree ("workspace_id" text_ops,"provider_id" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_byok_workspace_idx" ON "workspace_byok_keys" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "agent_profile_browser_profile_id_idx" ON "agent_profile" USING btree ("browser_profile_id" text_ops);--> statement-breakpoint
CREATE INDEX "agent_profile_scope_idx" ON "agent_profile" USING btree ("scope" enum_ops);--> statement-breakpoint
CREATE INDEX "agent_profile_user_id_idx" ON "agent_profile" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "agent_profile_user_scope_idx" ON "agent_profile" USING btree ("user_id" text_ops,"scope" enum_ops);--> statement-breakpoint
CREATE INDEX "agent_profile_workspace_id_idx" ON "agent_profile" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "browser_profile_provider_type_idx" ON "browser_profile" USING btree ("provider_type" enum_ops);--> statement-breakpoint
CREATE INDEX "browser_profile_user_id_idx" ON "browser_profile" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "session" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "identifier_idx" ON "chat" USING btree ("identifier" text_ops);--> statement-breakpoint
CREATE INDEX "user_db_budget_exceeded_idx" ON "user_db_budget" USING btree ("budget_exceeded" bool_ops);--> statement-breakpoint
CREATE INDEX "user_db_budget_user_id_idx" ON "user_db_budget" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "user_global_database_user_id_idx" ON "user_global_database" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_database_workspace_id_idx" ON "workspace_database" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "memory_key_idx" ON "memory" USING btree ("key" text_ops);--> statement-breakpoint
CREATE INDEX "memory_workspace_idx" ON "memory" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "memory_workspace_key_idx" ON "memory" USING btree ("workspace_id" text_ops,"key" text_ops);--> statement-breakpoint
CREATE INDEX "kb_deleted_at_idx" ON "knowledge_base" USING btree ("deleted_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "kb_user_id_idx" ON "knowledge_base" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "kb_user_workspace_idx" ON "knowledge_base" USING btree ("user_id" text_ops,"workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "kb_workspace_id_idx" ON "knowledge_base" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_folder_parent_sort_idx" ON "workflow_folder" USING btree ("parent_id" int4_ops,"sort_order" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_folder_user_idx" ON "workflow_folder" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_folder_workspace_parent_idx" ON "workflow_folder" USING btree ("workspace_id" text_ops,"parent_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_edges_source_block_fk_idx" ON "workflow_edges" USING btree ("source_block_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_edges_target_block_fk_idx" ON "workflow_edges" USING btree ("target_block_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_edges_workflow_id_idx" ON "workflow_edges" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_edges_workflow_source_idx" ON "workflow_edges" USING btree ("workflow_id" text_ops,"source_block_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_edges_workflow_target_idx" ON "workflow_edges" USING btree ("workflow_id" text_ops,"target_block_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_subflows_workflow_id_idx" ON "workflow_subflows" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_subflows_workflow_type_idx" ON "workflow_subflows" USING btree ("workflow_id" text_ops,"type" text_ops);--> statement-breakpoint
CREATE INDEX "permissions_entity_idx" ON "permissions" USING btree ("entity_type" text_ops,"entity_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_unique_constraint" ON "permissions" USING btree ("user_id" text_ops,"entity_type" text_ops,"entity_id" text_ops);--> statement-breakpoint
CREATE INDEX "permissions_user_entity_idx" ON "permissions" USING btree ("user_id" text_ops,"entity_type" text_ops,"entity_id" text_ops);--> statement-breakpoint
CREATE INDEX "permissions_user_entity_permission_idx" ON "permissions" USING btree ("user_id" text_ops,"entity_type" text_ops,"permission_type" enum_ops);--> statement-breakpoint
CREATE INDEX "permissions_user_entity_type_idx" ON "permissions" USING btree ("user_id" text_ops,"entity_type" text_ops);--> statement-breakpoint
CREATE INDEX "permissions_user_id_idx" ON "permissions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_snapshots_created_at_idx" ON "workflow_execution_snapshots" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "workflow_snapshots_hash_idx" ON "workflow_execution_snapshots" USING btree ("state_hash" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_snapshots_workflow_hash_idx" ON "workflow_execution_snapshots" USING btree ("workflow_id" text_ops,"state_hash" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_snapshots_workflow_id_idx" ON "workflow_execution_snapshots" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "docs_emb_chunk_text_fts_idx" ON "docs_embeddings" USING gin ("chunk_text_tsv" tsvector_ops);--> statement-breakpoint
CREATE INDEX "docs_emb_created_at_idx" ON "docs_embeddings" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "docs_emb_header_level_idx" ON "docs_embeddings" USING btree ("header_level" int4_ops);--> statement-breakpoint
CREATE INDEX "docs_emb_metadata_gin_idx" ON "docs_embeddings" USING gin ("metadata" jsonb_ops);--> statement-breakpoint
CREATE INDEX "docs_emb_model_idx" ON "docs_embeddings" USING btree ("embedding_model" text_ops);--> statement-breakpoint
CREATE INDEX "docs_emb_source_document_idx" ON "docs_embeddings" USING btree ("source_document" text_ops);--> statement-breakpoint
CREATE INDEX "docs_emb_source_header_idx" ON "docs_embeddings" USING btree ("source_document" text_ops,"header_level" text_ops);--> statement-breakpoint
CREATE INDEX "docs_embedding_vector_hnsw_idx" ON "docs_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "emb_boolean1_idx" ON "embedding" USING btree ("boolean1" bool_ops);--> statement-breakpoint
CREATE INDEX "emb_boolean2_idx" ON "embedding" USING btree ("boolean2" bool_ops);--> statement-breakpoint
CREATE INDEX "emb_boolean3_idx" ON "embedding" USING btree ("boolean3" bool_ops);--> statement-breakpoint
CREATE INDEX "emb_content_fts_idx" ON "embedding" USING gin ("content_tsv" tsvector_ops);--> statement-breakpoint
CREATE INDEX "emb_date1_idx" ON "embedding" USING btree ("date1" timestamp_ops);--> statement-breakpoint
CREATE INDEX "emb_date2_idx" ON "embedding" USING btree ("date2" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "emb_doc_chunk_idx" ON "embedding" USING btree ("document_id" text_ops,"chunk_index" int4_ops);--> statement-breakpoint
CREATE INDEX "emb_doc_enabled_idx" ON "embedding" USING btree ("document_id" bool_ops,"enabled" bool_ops);--> statement-breakpoint
CREATE INDEX "emb_doc_id_idx" ON "embedding" USING btree ("document_id" text_ops);--> statement-breakpoint
CREATE INDEX "emb_kb_enabled_idx" ON "embedding" USING btree ("knowledge_base_id" bool_ops,"enabled" bool_ops);--> statement-breakpoint
CREATE INDEX "emb_kb_id_idx" ON "embedding" USING btree ("knowledge_base_id" text_ops);--> statement-breakpoint
CREATE INDEX "emb_kb_model_idx" ON "embedding" USING btree ("knowledge_base_id" text_ops,"embedding_model" text_ops);--> statement-breakpoint
CREATE INDEX "emb_number1_idx" ON "embedding" USING btree ("number1" float8_ops);--> statement-breakpoint
CREATE INDEX "emb_number2_idx" ON "embedding" USING btree ("number2" float8_ops);--> statement-breakpoint
CREATE INDEX "emb_number3_idx" ON "embedding" USING btree ("number3" float8_ops);--> statement-breakpoint
CREATE INDEX "emb_number4_idx" ON "embedding" USING btree ("number4" float8_ops);--> statement-breakpoint
CREATE INDEX "emb_number5_idx" ON "embedding" USING btree ("number5" float8_ops);--> statement-breakpoint
CREATE INDEX "emb_tag1_idx" ON "embedding" USING btree ("tag1" text_ops);--> statement-breakpoint
CREATE INDEX "emb_tag2_idx" ON "embedding" USING btree ("tag2" text_ops);--> statement-breakpoint
CREATE INDEX "emb_tag3_idx" ON "embedding" USING btree ("tag3" text_ops);--> statement-breakpoint
CREATE INDEX "emb_tag4_idx" ON "embedding" USING btree ("tag4" text_ops);--> statement-breakpoint
CREATE INDEX "emb_tag5_idx" ON "embedding" USING btree ("tag5" text_ops);--> statement-breakpoint
CREATE INDEX "emb_tag6_idx" ON "embedding" USING btree ("tag6" text_ops);--> statement-breakpoint
CREATE INDEX "emb_tag7_idx" ON "embedding" USING btree ("tag7" text_ops);--> statement-breakpoint
CREATE INDEX "embedding_vector_hnsw_idx" ON "embedding" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "template_stars_starred_at_idx" ON "template_stars" USING btree ("starred_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "template_stars_template_id_idx" ON "template_stars" USING btree ("template_id" text_ops);--> statement-breakpoint
CREATE INDEX "template_stars_template_starred_at_idx" ON "template_stars" USING btree ("template_id" text_ops,"starred_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "template_stars_template_user_idx" ON "template_stars" USING btree ("template_id" text_ops,"user_id" text_ops);--> statement-breakpoint
CREATE INDEX "template_stars_user_id_idx" ON "template_stars" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "template_stars_user_template_idx" ON "template_stars" USING btree ("user_id" text_ops,"template_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "template_stars_user_template_unique" ON "template_stars" USING btree ("user_id" text_ops,"template_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_webhook_on_workflow_id_block_id" ON "webhook" USING btree ("workflow_id" text_ops,"block_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "path_idx" ON "webhook" USING btree ("path" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "kb_tag_definitions_kb_display_name_idx" ON "knowledge_base_tag_definitions" USING btree ("knowledge_base_id" text_ops,"display_name" text_ops);--> statement-breakpoint
CREATE INDEX "kb_tag_definitions_kb_id_idx" ON "knowledge_base_tag_definitions" USING btree ("knowledge_base_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "kb_tag_definitions_kb_slot_idx" ON "knowledge_base_tag_definitions" USING btree ("knowledge_base_id" text_ops,"tag_slot" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_chat_created_at_idx" ON "workflow_checkpoints" USING btree ("chat_id" uuid_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_chat_id_idx" ON "workflow_checkpoints" USING btree ("chat_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_created_at_idx" ON "workflow_checkpoints" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_message_id_idx" ON "workflow_checkpoints" USING btree ("message_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_user_id_idx" ON "workflow_checkpoints" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_user_workflow_idx" ON "workflow_checkpoints" USING btree ("user_id" text_ops,"workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_workflow_chat_idx" ON "workflow_checkpoints" USING btree ("workflow_id" text_ops,"chat_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "workflow_checkpoints_workflow_id_idx" ON "workflow_checkpoints" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "copilot_feedback_chat_id_idx" ON "copilot_feedback" USING btree ("chat_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "copilot_feedback_created_at_idx" ON "copilot_feedback" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "copilot_feedback_is_positive_idx" ON "copilot_feedback" USING btree ("is_positive" bool_ops);--> statement-breakpoint
CREATE INDEX "copilot_feedback_user_chat_idx" ON "copilot_feedback" USING btree ("user_id" uuid_ops,"chat_id" text_ops);--> statement-breakpoint
CREATE INDEX "copilot_feedback_user_id_idx" ON "copilot_feedback" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_blocks_type_idx" ON "workflow_blocks" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_blocks_workflow_id_idx" ON "workflow_blocks" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "copilot_chats_created_at_idx" ON "copilot_chats" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "copilot_chats_updated_at_idx" ON "copilot_chats" USING btree ("updated_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "copilot_chats_user_id_idx" ON "copilot_chats" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "copilot_chats_user_workflow_idx" ON "copilot_chats" USING btree ("user_id" text_ops,"workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "copilot_chats_workflow_id_idx" ON "copilot_chats" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_deployment_version_id_idx" ON "workflow_execution_logs" USING btree ("deployment_version_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_execution_logs_execution_id_unique" ON "workflow_execution_logs" USING btree ("execution_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_level_idx" ON "workflow_execution_logs" USING btree ("level" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_started_at_idx" ON "workflow_execution_logs" USING btree ("started_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_state_snapshot_id_idx" ON "workflow_execution_logs" USING btree ("state_snapshot_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_trigger_idx" ON "workflow_execution_logs" USING btree ("trigger" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_workflow_id_idx" ON "workflow_execution_logs" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_workflow_started_at_idx" ON "workflow_execution_logs" USING btree ("workflow_id" text_ops,"started_at" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_execution_logs_workspace_started_at_idx" ON "workflow_execution_logs" USING btree ("workspace_id" text_ops,"started_at" text_ops);--> statement-breakpoint
CREATE INDEX "subscription_reference_status_idx" ON "subscription" USING btree ("reference_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_environment_workspace_unique" ON "workspace_environment" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "mcp_servers_workspace_deleted_idx" ON "mcp_servers" USING btree ("workspace_id" text_ops,"deleted_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "mcp_servers_workspace_enabled_idx" ON "mcp_servers" USING btree ("workspace_id" bool_ops,"enabled" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_user_id_idx" ON "workflow" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_user_workspace_idx" ON "workflow" USING btree ("user_id" text_ops,"workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_workspace_id_idx" ON "workflow" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "api_key_user_type_idx" ON "api_key" USING btree ("user_id" text_ops,"type" text_ops);--> statement-breakpoint
CREATE INDEX "api_key_workspace_type_idx" ON "api_key" USING btree ("workspace_id" text_ops,"type" text_ops);--> statement-breakpoint
CREATE INDEX "idempotency_key_created_at_idx" ON "idempotency_key" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idempotency_key_namespace_idx" ON "idempotency_key" USING btree ("namespace" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_key_namespace_unique" ON "idempotency_key" USING btree ("key" text_ops,"namespace" text_ops);--> statement-breakpoint
CREATE INDEX "sso_provider_domain_idx" ON "sso_provider" USING btree ("domain" text_ops);--> statement-breakpoint
CREATE INDEX "sso_provider_organization_id_idx" ON "sso_provider" USING btree ("organization_id" text_ops);--> statement-breakpoint
CREATE INDEX "sso_provider_provider_id_idx" ON "sso_provider" USING btree ("provider_id" text_ops);--> statement-breakpoint
CREATE INDEX "sso_provider_user_id_idx" ON "sso_provider" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workflow_deployment_version_created_at_idx" ON "workflow_deployment_version" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "workflow_deployment_version_workflow_active_idx" ON "workflow_deployment_version" USING btree ("workflow_id" bool_ops,"is_active" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_deployment_version_workflow_version_unique" ON "workflow_deployment_version" USING btree ("workflow_id" int4_ops,"version" int4_ops);--> statement-breakpoint
CREATE INDEX "workspace_file_key_idx" ON "workspace_file" USING btree ("key" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_file_workspace_id_idx" ON "workspace_file" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_files_context_idx" ON "workspace_files" USING btree ("context" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_files_key_idx" ON "workspace_files" USING btree ("key" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_files_user_id_idx" ON "workspace_files" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "workspace_files_workspace_id_idx" ON "workspace_files" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE INDEX "custom_tools_workspace_id_idx" ON "custom_tools" USING btree ("workspace_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "custom_tools_workspace_title_unique" ON "custom_tools" USING btree ("workspace_id" text_ops,"title" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "paused_executions_execution_id_unique" ON "paused_executions" USING btree ("execution_id" text_ops);--> statement-breakpoint
CREATE INDEX "paused_executions_status_idx" ON "paused_executions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "paused_executions_workflow_id_idx" ON "paused_executions" USING btree ("workflow_id" text_ops);--> statement-breakpoint
CREATE INDEX "resume_queue_new_execution_idx" ON "resume_queue" USING btree ("new_execution_id" text_ops);--> statement-breakpoint
CREATE INDEX "resume_queue_parent_status_idx" ON "resume_queue" USING btree ("parent_execution_id" text_ops,"status" timestamp_ops,"queued_at" text_ops);--> statement-breakpoint
CREATE INDEX "template_creators_created_by_idx" ON "template_creators" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE INDEX "template_creators_reference_id_idx" ON "template_creators" USING btree ("reference_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "template_creators_reference_idx" ON "template_creators" USING btree ("reference_type" enum_ops,"reference_id" text_ops);--> statement-breakpoint
CREATE INDEX "templates_created_at_idx" ON "templates" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "templates_creator_id_idx" ON "templates" USING btree ("creator_id" text_ops);--> statement-breakpoint
CREATE INDEX "templates_stars_idx" ON "templates" USING btree ("stars" int4_ops);--> statement-breakpoint
CREATE INDEX "templates_status_idx" ON "templates" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "templates_status_stars_idx" ON "templates" USING btree ("status" int4_ops,"stars" enum_ops);--> statement-breakpoint
CREATE INDEX "templates_status_views_idx" ON "templates" USING btree ("status" int4_ops,"views" int4_ops);--> statement-breakpoint
CREATE INDEX "templates_updated_at_idx" ON "templates" USING btree ("updated_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "templates_views_idx" ON "templates" USING btree ("views" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_schedule_workflow_block_unique" ON "workflow_schedule" USING btree ("workflow_id" text_ops,"block_id" text_ops);
*/