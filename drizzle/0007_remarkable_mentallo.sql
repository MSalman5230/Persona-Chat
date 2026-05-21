ALTER TABLE "chat_sessions" ALTER COLUMN "thinking_level" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "thinking_level" DROP NOT NULL;