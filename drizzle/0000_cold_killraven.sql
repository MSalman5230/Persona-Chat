CREATE TYPE "public"."mcp_status" AS ENUM('unknown', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."mcp_transport" AS ENUM('stdio', 'streamable_http', 'sse');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('built_in', 'custom');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"pi_message" jsonb NOT NULL,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"provider_connection_id" uuid,
	"provider_id" text,
	"model_id" text,
	"thinking_level" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"transport" "mcp_transport" NOT NULL,
	"command" text,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cwd" text,
	"url" text,
	"secret" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" "mcp_status" DEFAULT 'unknown' NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_servers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider_id" text NOT NULL,
	"kind" "provider_kind" DEFAULT 'built_in' NOT NULL,
	"api" text DEFAULT 'openai' NOT NULL,
	"base_url" text,
	"default_model" text NOT NULL,
	"default_thinking_level" text DEFAULT 'medium' NOT NULL,
	"auth_header" boolean DEFAULT true NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_provider_connection_id_provider_connections_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_messages_sequence_idx" ON "chat_messages" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "chat_sessions_created_at_idx" ON "chat_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mcp_servers_enabled_idx" ON "mcp_servers" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "mcp_servers_slug_idx" ON "mcp_servers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "provider_connections_provider_idx" ON "provider_connections" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "provider_connections_default_idx" ON "provider_connections" USING btree ("is_default");