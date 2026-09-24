ALTER TABLE "conversation_agent" ADD COLUMN "session_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_agent" ADD COLUMN "carry_over" text;