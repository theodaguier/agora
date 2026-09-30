ALTER TABLE "code_session" ADD COLUMN "todos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "code_session" ADD COLUMN "commands" jsonb DEFAULT '[]'::jsonb NOT NULL;