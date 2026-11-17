CREATE TABLE "conversation_avatar" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "conversation_avatar" ADD CONSTRAINT "conversation_avatar_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;