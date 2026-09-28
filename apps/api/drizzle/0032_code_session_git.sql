ALTER TABLE "code_session" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "code_session" ADD COLUMN "git" jsonb;--> statement-breakpoint
ALTER TABLE "code_session" ADD COLUMN "account" jsonb;