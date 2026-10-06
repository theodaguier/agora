ALTER TABLE "code_session" ADD COLUMN "engine" text DEFAULT 'claude' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_session" ADD COLUMN "engine_thread" text;