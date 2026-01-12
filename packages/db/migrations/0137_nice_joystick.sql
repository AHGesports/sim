CREATE TABLE "workspace_system_mcp_tool_config" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"server_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_system_mcp_tool_config" ADD CONSTRAINT "workspace_system_mcp_tool_config_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_system_mcp_tool_config_unique" ON "workspace_system_mcp_tool_config" USING btree ("workspace_id","server_id","tool_name");--> statement-breakpoint
CREATE INDEX "workspace_system_mcp_tool_config_workspace_idx" ON "workspace_system_mcp_tool_config" USING btree ("workspace_id");