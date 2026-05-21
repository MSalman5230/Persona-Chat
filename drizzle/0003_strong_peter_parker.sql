CREATE TABLE "system_prompt_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "system_prompt_presets_name_idx" ON "system_prompt_presets" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "system_prompt_presets_default_idx" ON "system_prompt_presets" USING btree ("is_default") WHERE "system_prompt_presets"."is_default" = true;