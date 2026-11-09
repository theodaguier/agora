ALTER TABLE "bot_webhook" ADD COLUMN "auto_merge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "code_session" ADD COLUMN "webhook_id" text;--> statement-breakpoint
ALTER TABLE "code_session" ADD CONSTRAINT "code_session_webhook_id_bot_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."bot_webhook"("id") ON DELETE set null ON UPDATE no action;