CREATE TYPE "public"."db_budget_tier" AS ENUM('free', 'paid', 'enterprise', 'custom');--> statement-breakpoint
CREATE TYPE "public"."db_ownership_type" AS ENUM('platform', 'user');--> statement-breakpoint
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
ALTER TABLE "user_db_budget" ADD CONSTRAINT "user_db_budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_global_database" ADD CONSTRAINT "user_global_database_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_database" ADD CONSTRAINT "workspace_database_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_db_budget_user_id_idx" ON "user_db_budget" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_db_budget_exceeded_idx" ON "user_db_budget" USING btree ("budget_exceeded");--> statement-breakpoint
CREATE INDEX "user_global_database_user_id_idx" ON "user_global_database" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_database_workspace_id_idx" ON "workspace_database" USING btree ("workspace_id");