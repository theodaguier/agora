CREATE TABLE "code_session" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"agent_id" text,
	"requested_by" text,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"cwd" text NOT NULL,
	"model" text,
	"result" text,
	"permissions" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_session" ADD CONSTRAINT "code_session_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_session" ADD CONSTRAINT "code_session_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_session" ADD CONSTRAINT "code_session_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_session_conversation_idx" ON "code_session" USING btree ("conversation_id");