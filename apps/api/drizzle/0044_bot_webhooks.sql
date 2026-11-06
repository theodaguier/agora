CREATE TABLE "bot_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"token_hash" text NOT NULL,
	"dedupe_field" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_received_at" timestamp,
	"last_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bot_webhook_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bot_webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bot_webhook_delivery_key" UNIQUE("webhook_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "bot_webhook" ADD CONSTRAINT "bot_webhook_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_webhook" ADD CONSTRAINT "bot_webhook_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_webhook" ADD CONSTRAINT "bot_webhook_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_webhook_delivery" ADD CONSTRAINT "bot_webhook_delivery_webhook_id_bot_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."bot_webhook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_webhook_agent_idx" ON "bot_webhook" USING btree ("agent_id");