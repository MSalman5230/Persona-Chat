CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"tool_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mcp_server_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agents_name_idx" ON "agents" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_default_idx" ON "agents" USING btree ("is_default") WHERE "agents"."is_default" = true;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_sessions" RENAME COLUMN "system_prompt" TO "custom_instruction";--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_prompt_presets" RENAME TO "custom_instruction_presets";--> statement-breakpoint
ALTER TABLE "custom_instruction_presets" RENAME COLUMN "prompt" TO "instruction";--> statement-breakpoint
ALTER INDEX "system_prompt_presets_name_idx" RENAME TO "custom_instruction_presets_name_idx";--> statement-breakpoint
ALTER INDEX "system_prompt_presets_default_idx" RENAME TO "custom_instruction_presets_default_idx";
