ALTER TABLE "code_session" ADD COLUMN "priority" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_session" ADD COLUMN "issue" jsonb;