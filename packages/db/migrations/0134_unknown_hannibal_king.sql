CREATE TYPE "public"."browser_profile_provider_type" AS ENUM('own_browser', 'more_login');--> statement-breakpoint
CREATE TYPE "public"."profile_scope" AS ENUM('global', 'workspace');--> statement-breakpoint
CREATE TABLE "agent_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"scope" "profile_scope" NOT NULL,
	"browser_profile_id" text,
	"name" text NOT NULL,
	"profile_data" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scope_workspace_check" CHECK ((scope = 'global' AND workspace_id IS NULL) OR (scope = 'workspace' AND workspace_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "browser_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_type" "browser_profile_provider_type" NOT NULL,
	"provider_config" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_profile" ADD CONSTRAINT "agent_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profile" ADD CONSTRAINT "agent_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profile" ADD CONSTRAINT "agent_profile_browser_profile_id_browser_profile_id_fk" FOREIGN KEY ("browser_profile_id") REFERENCES "public"."browser_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_profile" ADD CONSTRAINT "browser_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_profile_user_id_idx" ON "agent_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_profile_workspace_id_idx" ON "agent_profile" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_profile_scope_idx" ON "agent_profile" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "agent_profile_browser_profile_id_idx" ON "agent_profile" USING btree ("browser_profile_id");--> statement-breakpoint
CREATE INDEX "agent_profile_user_scope_idx" ON "agent_profile" USING btree ("user_id","scope");--> statement-breakpoint
CREATE INDEX "browser_profile_user_id_idx" ON "browser_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "browser_profile_provider_type_idx" ON "browser_profile" USING btree ("provider_type");