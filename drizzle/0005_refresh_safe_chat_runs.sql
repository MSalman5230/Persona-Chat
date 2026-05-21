CREATE TABLE "chat_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error_text" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "chat_messages_sequence_idx";--> statement-breakpoint
ALTER TABLE "chat_runs" ADD CONSTRAINT "chat_runs_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_runs_session_idx" ON "chat_runs" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_runs_active_session_idx" ON "chat_runs" USING btree ("session_id") WHERE "chat_runs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_sequence_idx" ON "chat_messages" USING btree ("session_id","sequence");