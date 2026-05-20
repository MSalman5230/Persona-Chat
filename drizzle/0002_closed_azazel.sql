ALTER TABLE "chat_sessions" ADD COLUMN "system_prompt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "temperature" real;