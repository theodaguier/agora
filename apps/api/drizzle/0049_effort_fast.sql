ALTER TABLE "code_session" ADD COLUMN "effort" text;--> statement-breakpoint
ALTER TABLE "code_session" ADD COLUMN "fast" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_agent" ADD COLUMN "effort" text;--> statement-breakpoint
ALTER TABLE "conversation_agent" ADD COLUMN "fast" boolean DEFAULT false NOT NULL;