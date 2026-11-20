ALTER TABLE "conversation" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "context" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "context_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "context_author" jsonb;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "resources" jsonb;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "bot_access" jsonb;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_lead_id_user_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;