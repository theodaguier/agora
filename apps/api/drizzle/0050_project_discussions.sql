ALTER TABLE "conversation" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_parent_id_conversation_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;