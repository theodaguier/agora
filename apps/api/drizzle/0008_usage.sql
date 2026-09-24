CREATE TABLE "model_price" (
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input" double precision NOT NULL,
	"output" double precision NOT NULL,
	"cache_read" double precision NOT NULL,
	"cache_write" double precision NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_price_provider_model_pk" PRIMARY KEY("provider","model")
);
--> statement-breakpoint
CREATE TABLE "usage_attribution" (
	"profile" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text,
	"agent_id" text,
	"conversation_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_attribution_profile_session_id_pk" PRIMARY KEY("profile","session_id")
);
--> statement-breakpoint
CREATE TABLE "usage_cursor" (
	"profile" text NOT NULL,
	"session_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"task" text NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"last_seen" double precision NOT NULL,
	CONSTRAINT "usage_cursor_profile_session_id_provider_model_task_pk" PRIMARY KEY("profile","session_id","provider","model","task")
);
--> statement-breakpoint
CREATE TABLE "usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"engine" text NOT NULL,
	"profile" text,
	"session_id" text,
	"source" text NOT NULL,
	"task_id" text,
	"task_name" text,
	"user_id" text,
	"agent_id" text,
	"conversation_id" text,
	"provider" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"api_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"reported_cost_usd" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_price" ADD CONSTRAINT "model_price_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_attribution" ADD CONSTRAINT "usage_attribution_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_event_occurred_idx" ON "usage_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "usage_event_user_idx" ON "usage_event" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_event_agent_idx" ON "usage_event" USING btree ("agent_id","occurred_at");