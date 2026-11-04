CREATE TABLE "github_merge_request" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"head_sha" text,
	"method" text DEFAULT 'squash' NOT NULL,
	"agent_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"session_id" text,
	"requested_by" text,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_merge_request" ADD CONSTRAINT "github_merge_request_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_merge_request" ADD CONSTRAINT "github_merge_request_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_merge_request" ADD CONSTRAINT "github_merge_request_session_id_code_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."code_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_merge_request" ADD CONSTRAINT "github_merge_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_merge_request_conversation_idx" ON "github_merge_request" USING btree ("conversation_id");